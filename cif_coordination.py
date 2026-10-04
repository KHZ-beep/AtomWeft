# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
"""Coordination from CIF bonds/symmetry, with an explicit periodic-distance fallback."""
import math,re
from collections import defaultdict
import gemmi
from rdkit import Chem
PT=Chem.GetPeriodicTable()
def _values(block,name):
    values=list(block.find_values('_geom_bond_'+name))
    return values or list(block.find_values('_geom_bond.'+name))
def _key(label,f):return (label,)+tuple(round(v%1,5)%1 for v in f)
def identify_coordination(small,block,atoms,warnings,expand=True):
    cell=small.cell
    ops=[gemmi.Op(s) for s in small.symops] if small.symops else list(small.spacegroup.operations()) if small.spacegroup else [gemmi.Op('x,y,z')]
    ids=list(block.find_values('_space_group_symop_id')) or list(block.find_values('_symmetry_equiv_pos_site_id'))
    by_id={str(ids[i] if i<len(ids) else i+1):op for i,op in enumerate(ops)}
    sites={s.label:s for s in small.sites if s.occ>0}
    def sympos(label,code):
        site=sites[label];f=list(site.fract)
        if code in ('.','?',''):return f
        match=re.fullmatch(r'(\d+)(?:_([0-9]{3}))?',code)
        if not match or match[1] not in by_id:raise ValueError('Unsupported CIF symmetry code')
        result=by_id[match[1]].apply_to_xyz(f)
        return [v+(int(match[2][k])-5 if match[2] else 0) for k,v in enumerate(result)]
    rules=defaultdict(list);left=_values(block,'atom_site_label_1');right=_values(block,'atom_site_label_2')
    codes1=_values(block,'site_symmetry_1');codes2=_values(block,'site_symmetry_2');skipped=0
    for row,(a,b) in enumerate(zip(left,right)):
        try:
            pa=sympos(a,codes1[row] if row<len(codes1) else '.')
            pb=sympos(b,codes2[row] if row<len(codes2) else '.')
            for op in ops if expand else [gemmi.Op('x,y,z')]:
                qa,qb=op.apply_to_xyz(pa),op.apply_to_xyz(pb)
                rules[_key(a,qa)].append((b,[qb[k]-qa[k] for k in range(3)]))
                rules[_key(b,qb)].append((a,[qa[k]-qb[k] for k in range(3)]))
        except (KeyError,ValueError):skipped+=1
    if skipped:warnings.append(f'CIF 配位表中 {skipped} 行标签或对称码无法解释；这些行未作为显式配位使用。')
    frac=[list(cell.fractionalize(gemmi.Position(*a['xyz']))) for a in atoms]
    indices=defaultdict(list)
    for i,(a,f) in enumerate(zip(atoms,frac)):indices[_key(a['label'],f)].append(i)
    def vertex(label,f,element):
        xyz=list(cell.orthogonalize(gemmi.Fractional(*f)))
        matches=indices.get(_key(label,f),[])
        idx=min(matches,key=lambda i:math.dist(xyz,atoms[i]['xyz'])) if matches else None
        return dict(atom=idx,xyz=xyz,offset=[xyz[k]-atoms[idx]['xyz'][k] for k in range(3)] if idx is not None else [0,0,0],element=element,label=label)
    search=gemmi.NeighborSearch(small,6.0).populate()
    shells=[];explicit_pairs=set();counts=defaultdict(int)
    for i,a in enumerate(atoms):
        candidates=[];declared=rules.get(_key(a['label'],frac[i]),[])
        if declared:
            for label,delta in declared:
                v=vertex(label,[frac[i][k]+delta[k] for k in range(3)],sites[label].element.name)
                if math.dist(a['xyz'],v['xyz'])>.1:candidates.append(v)
            source='cif-bonds'
        elif gemmi.Element(a['element']).is_metal or a['element'] in ('B','Si','Ge','P','As','S','Se','Te'):
            source='periodic-distance';seen_marks=set()
            for mark in search.find_atoms(gemmi.Position(*a['xyz']),min_dist=.1,radius=6):
                site=mark.to_site(small)
                if site.occ<=0 or site.element.name=='H':continue
                fpos=cell.fractionalize(mark.pos);mk=(site.label,)+tuple(round(v,6) for v in fpos)
                if mk in seen_marks:continue
                seen_marks.add(mk)
                cutoff=min(6.,1.3*(PT.GetRcovalent(a['element'])+PT.GetRcovalent(site.element.name)))
                for image in cell.find_nearest_pbc_images(gemmi.Fractional(*frac[i]),cutoff,fpos,0):
                    f=list(cell.fract_image(image,fpos));v=vertex(site.label,f,site.element.name)
                    if math.dist(a['xyz'],v['xyz'])>.35:candidates.append(v)
            if candidates:
                nearest=min(math.dist(a['xyz'],v['xyz']) for v in candidates)
                candidates=[v for v in candidates if math.dist(a['xyz'],v['xyz'])<=nearest*1.35+1e-6]
        else:continue
        unique={tuple(round(c,5) for c in v['xyz']):v for v in candidates};vertices=list(unique.values())
        if source=='cif-bonds':
            for v in vertices:
                j=v['atom']
                if j is not None and i!=j and math.hypot(*v['offset'])<1e-4:explicit_pairs.add(tuple(sorted((i,j))))
        if not (gemmi.Element(a['element']).is_metal or a['element'] in ('B','Si','Ge','P','As','S','Se','Te')):continue
        if 4<=len(vertices)<=24:
            if len(shells)<200:shells.append(dict(center=i,origin=list(a['xyz']),vertices=vertices,source=source))
            counts[source]+=1
    if counts['periodic-distance']:warnings.append('部分配位由 CIF 晶胞、对称操作与周期距离自动推断（最近邻壳层及共价半径阈值），并非文件显式指定；请核对配位数。')
    if sum(counts.values())>200:warnings.append('自动配位中心超过 200 个，当前保留前 200 个。')
    return dict(shells=shells,explicitRows=len(left)-skipped,method='CIF symmetry and periodic coordination'),explicit_pairs
