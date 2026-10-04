# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
"""Molecular readers. Coordinates/radii use angstroms; inferred bonds are explicit."""
import bootstrap  # noqa: F401
import itertools
import math
from collections import defaultdict
from pathlib import Path

import gemmi
from rdkit import Chem

LIMIT = 4000
COLORS = {'H':'#E8EDF3','C':'#53627A','N':'#397CEC','O':'#EF5350',
          'F':'#62C97B','Cl':'#4CBD71','Br':'#A64D35','I':'#9258CC',
          'S':'#E9BE3C','P':'#EF9740','Li':'#AC7BEF','Na':'#8F76D6',
          'K':'#9C68DC','Mg':'#58C49E','Ca':'#80BF61','Fe':'#CB8150',
          'Cu':'#BE7B57','Zn':'#8EA6B9','Si':'#C2A184','B':'#D6A68A'}
PT = Chem.GetPeriodicTable()


def atom(element, xyz, label='', occupancy=1.0):
    el = gemmi.Element(element)
    if not el.atomic_number:
        raise ValueError(f'无法识别元素：{element}（不支持虚拟原子）。')
    element = el.name
    if element == 'D':
        element = 'H'
    xyz = [float(v) for v in xyz]
    if not all(math.isfinite(v) and abs(v) < 1e6 for v in xyz):
        raise ValueError('坐标无效或超出支持范围。')
    return dict(element=element, xyz=xyz, label=label or element, occupancy=occupancy)


def infer_bonds(atoms, factor):
    # Spatial hash avoids quadratic comparisons for proteins and supercells.
    radii = [PT.GetRcovalent(a['element']) for a in atoms]
    size = max(radii, default=1) * 2 * factor
    grid = defaultdict(list)
    bonds = []
    for i, a in enumerate(atoms):
        key = tuple(math.floor(v / size) for v in a['xyz'])
        for offset in itertools.product((-1, 0, 1), repeat=3):
            for j in grid[tuple(key[k] + offset[k] for k in range(3))]:
                d = math.dist(a['xyz'], atoms[j]['xyz'])
                if .35 < d <= factor * (radii[i] + radii[j]):
                    if len(bonds) >= 16000:
                        raise ValueError('连接数量过多，请检查坐标或降低成键阈值。')
                    bonds.append(dict(a=j, b=i, order=1, inferred=True))
        grid[key].append(i)
    return bonds


def parse_structure(name, text, options=None):
    options = options or {}
    ext = Path(name).suffix.lower()
    atoms, bonds, warnings, cell = [], [], [], None
    coordination=None;crystal_pairs=set()
    explicit = False
    factor = float(options.get('bondFactor', 1.2))
    if not 0.8 <= factor <= 1.6:
        raise ValueError('成键阈值必须在 0.8–1.6 之间。')
    if ext in ('.mol', '.sdf'):
        blocks = text.split('$$$$')
        mol = Chem.MolFromMolBlock(blocks[0], sanitize=False, removeHs=False, strictParsing=True)
        if mol is None or not mol.GetNumConformers():
            raise ValueError('MOL/SDF 解析失败。请检查 V2000/V3000 文件。')
        conf = mol.GetConformer()
        for a in mol.GetAtoms():
            p = conf.GetAtomPosition(a.GetIdx())
            atoms.append(atom(a.GetSymbol(), (p.x, p.y, p.z), f'{a.GetSymbol()}{a.GetIdx()+1}'))
        for b in mol.GetBonds():
            bonds.append(dict(a=b.GetBeginAtomIdx(), b=b.GetEndAtomIdx(),
                              order=b.GetBondTypeAsDouble(), inferred=False))
        explicit = True
        if any(block.strip() for block in blocks[1:]):
            warnings.append('SDF 含多个分子，当前读取第一个分子。')
        if not conf.Is3D():
            warnings.append('文件包含二维坐标；旋转不会自动生成真实三维构象。')
    elif ext == '.xyz':
        lines = text.lstrip('\ufeff').splitlines()
        try:
            count = int(lines[0].strip())
            if count < 1 or count > LIMIT or len(lines) < count + 2:
                raise ValueError()
            for i, line in enumerate(lines[2:count+2]):
                parts = line.split()
                symbol = gemmi.Element(int(parts[0])).name if parts[0].isdigit() else parts[0]
                atoms.append(atom(symbol, parts[1:4], f'{symbol}{i+1}'))
                if len(atoms[-1]['xyz']) != 3:
                    raise ValueError()
            if any(line.strip() for line in lines[count+2:]):
                warnings.append('XYZ 含多个帧，当前读取第一帧。')
        except (ValueError, IndexError) as e:
            raise ValueError('XYZ 格式无效：首行为原子数，次行为注释，随后每行元素和 x y z。') from e
    elif ext in ('.pdb', '.ent'):
        st = gemmi.read_pdb_string(text)
        atoms, serials = _macro_atoms(st, warnings)
        seen = set()
        for line in text.splitlines():
            if not line.startswith('CONECT'):
                continue
            fields = [line[k:k+5].strip() for k in range(6, len(line), 5)]
            if not fields or not fields[0].isdigit():
                continue
            src = serials.get(int(fields[0]))
            for f in fields[1:]:
                dst = serials.get(int(f)) if f.isdigit() else None
                if src is not None and dst is not None and src != dst:
                    key = tuple(sorted((src, dst)))
                    if key not in seen:
                        seen.add(key)
                        bonds.append(dict(a=key[0], b=key[1], order=1, inferred=False))
        # CONECT may cover only ligands; complete missing pairs by distance.
        if len(atoms) > LIMIT:
            raise ValueError(f'当前上限 {LIMIT} 个原子，请先提取所需链或片段。')
        inferred = infer_bonds(atoms, factor)
        bonds.extend(b for b in inferred if (b['a'], b['b']) not in seen)
        explicit = True
        warnings.append('PDB 保留 CONECT 连接，其余连接按距离推断；未恢复键级。')
    elif ext in ('.cif', '.mmcif'):
        doc = gemmi.cif.read_string(text)
        if len(doc) == 0:
            raise ValueError('CIF 中没有数据块。')
        block = next((b for b in doc if b.find_value('_atom_site.fract_x') or
                      len(b.find_values('_atom_site_fract_x')) or
                      len(b.find_values('_atom_site.Cartn_x'))), doc[0])
        if len(doc) > 1:
            warnings.append(f'CIF 含多个数据块，当前读取 {block.name}。')
        if len(block.find_values('_atom_site.Cartn_x')):
            atoms, _ = _macro_atoms(gemmi.make_structure_from_block(block), warnings)
        else:
            small = gemmi.make_small_structure_from_block(block)
            if not small.sites:
                raise ValueError('CIF 中未找到分数坐标；支持晶体 CIF 和含 Cartn 坐标的 mmCIF。')
            if not small.cell.is_crystal():
                raise ValueError('晶体 CIF 缺少有效晶胞参数。')
            expand = bool(options.get('expand', True))
            if expand and small.spacegroup is None and not small.symops:
                warnings.append('未找到有效空间群或对称操作，按 P1 处理。')
            sites = small.get_all_unit_cell_sites() if expand else small.sites
            repeats = options.get('repeats', [1, 1, 1])
            if len(repeats) != 3 or any(type(v) is not int or not 1 <= v <= 4 for v in repeats):
                raise ValueError('超胞重复数须为 1–4 的整数。')
            if len(sites) * math.prod(repeats) > LIMIT:
                raise ValueError(f'展开后超过 {LIMIT} 个原子，请缩小超胞。')
            partial = False
            for ix, iy, iz in itertools.product(*(range(v) for v in repeats)):
                for s in sites:
                    if s.occ <= 0:
                        continue
                    f = s.fract
                    coords = [(f.x % 1 if expand else f.x)+ix,
                              (f.y % 1 if expand else f.y)+iy,
                              (f.z % 1 if expand else f.z)+iz]
                    p = small.cell.orthogonalize(gemmi.Fractional(*coords))
                    atoms.append(atom(s.element.name, (p.x, p.y, p.z), s.label, float(s.occ)))
                    partial |= s.occ < .999
            if partial:
                warnings.append('包含部分占据或无序位点；当前均显示，需根据具体结构选择构型。')
            cell = dict(parameters=list(small.cell.parameters), repeats=repeats,
                        spacegroup=small.spacegroup_hm,
                        corners=[list(small.cell.orthogonalize(gemmi.Fractional(*f)))
                                 for f in itertools.product(*((0, r) for r in repeats))])
            warnings.append('晶体按有限晶胞/超胞显示；边界外原子与跨外边界的键不显示。')
            from cif_coordination import identify_coordination
            coordination,crystal_pairs=identify_coordination(small,block,atoms,warnings,expand)
    else:
        raise ValueError('支持 CIF、mmCIF、MOL、SDF、PDB、XYZ 文件。')
    if not atoms:
        raise ValueError('没有可显示的原子。')
    if len(atoms) > LIMIT:
        raise ValueError(f'当前上限 {LIMIT} 个原子，请先提取需要的链、片段或晶胞。')
    if not explicit:
        bonds = infer_bonds(atoms, factor)
        warnings.append('采用 CIF 显式键表，并按距离补充晶胞内连接；推断连接与键级需人工核对。' if crystal_pairs else '文件未提供采用的显式键表：依据共价半径和距离推断单键；配位键与键级需人工核对。')
    if crystal_pairs:
        bonds=[b for b in bonds if tuple(sorted((b['a'],b['b']))) not in crystal_pairs]
        bonds.extend(dict(a=a,b=b,order=1,inferred=False,source='cif-bonds') for a,b in sorted(crystal_pairs))
    if len(bonds) > 16000:
        raise ValueError('连接数量过多，请检查坐标或降低成键阈值。')
    elements = {}
    for a in atoms:
        e = a['element']
        elements.setdefault(e, dict(color=COLORS.get(e, '#91A4B4'), scale=1,
                                    covalent=PT.GetRcovalent(e), vdw=PT.GetRvdw(e),
                                    number=PT.GetAtomicNumber(e), count=0))['count'] += 1
    return dict(name=Path(name).name, atoms=atoms, bonds=bonds, elements=elements,
                warnings=warnings, cell=cell,coordination=coordination)


def _macro_atoms(st, warnings):
    if not len(st):
        raise ValueError('未找到结构模型。')
    if len(st) > 1:
        warnings.append('结构含多个模型，当前读取第一个模型。')
    atoms, serials = [], {}
    alternate = False
    for chain in st[0]:
        for residue in chain:
            chosen = {}
            for a in residue:
                if a.occ <= 0:
                    continue
                old = chosen.get(a.name)
                if old is not None:
                    alternate = True
                if old is None or a.occ > old.occ:
                    chosen[a.name] = a
            for a in chosen.values():
                serials[a.serial] = len(atoms)
                atoms.append(atom(a.element.name, (a.pos.x, a.pos.y, a.pos.z),
                                  f'{chain.name}/{residue.name}{residue.seqid}/{a.name}', a.occ))
    if alternate:
        warnings.append('替代构象按同名原子的最高占据率选择一个位置。')
    return atoms, serials
