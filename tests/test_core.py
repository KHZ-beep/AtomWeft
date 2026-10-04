# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import bootstrap
import io
import unittest
import zipfile
import xml.etree.ElementTree as ET
from chemistry import parse_structure, infer_bonds
from powerpoint import make_pptx, validate_scene
from rdkit import Chem
from rdkit.Chem import AllChem

CIF='''data_test
_cell_length_a 5.43
_cell_length_b 5.43
_cell_length_c 5.43
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_space_group_name_H-M_alt 'F d -3 m'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Si1 Si 0.125 0.125 0.125
'''

class Readers(unittest.TestCase):
    def test_dense_structure_rejects_bond_overflow_early(self):
        atoms = [{'element': 'C', 'xyz': [0, 0, 0]} for _ in range(130)]
        atoms += [{'element': 'C', 'xyz': [1, 0, 0]} for _ in range(130)]
        with self.assertRaisesRegex(ValueError, '连接数量过多'):
            infer_bonds(atoms, 1.2)

    def test_xyz_water_and_hydrogen(self):
        m=parse_structure('water.xyz','3\nwater\nO 0 0 0\nH .957 0 0\nH -.24 .927 0')
        self.assertEqual(len(m['bonds']),2)
        self.assertTrue(all(b['inferred'] for b in m['bonds']))
        self.assertEqual(len(parse_structure('h2.xyz','2\nH2\nH 0 0 0\nH 0 0 .74')['bonds']),1)

    def test_mol_v2000_v3000_and_sdf(self):
        mol=Chem.MolFromSmiles('CC=O')
        AllChem.Compute2DCoords(mol)
        for v3 in (False,True):
            block=Chem.MolToMolBlock(mol,forceV3000=v3)
            m=parse_structure('a.mol',block)
            self.assertEqual([b['order'] for b in m['bonds']],[1,2])
            self.assertFalse(any(b['inferred'] for b in m['bonds']))
            self.assertTrue(any('二维' in w for w in m['warnings']))
        m=parse_structure('a.sdf',block+'$$$$\n'+block+'$$$$\n')
        self.assertTrue(any('第一个分子' in w for w in m['warnings']))

    def test_cif_symmetry_supercell(self):
        m=parse_structure('si.cif',CIF)
        self.assertEqual(len(m['atoms']),8)
        self.assertEqual(len(m['cell']['corners']),8)
        self.assertEqual(len(parse_structure('si.cif',CIF,{'expand':False})['atoms']),1)
        self.assertEqual(len(parse_structure('si.cif',CIF,{'repeats':[2,1,1]})['atoms']),16)
        self.assertGreater(len(m['bonds']),0)

    def test_cif_nonorthogonal_uncertainty(self):
        c=CIF.replace('5.43','5.43(2)').replace('90\n_space','120\n_space').replace("'F d -3 m'","'P 1'")
        m=parse_structure('a.cif',c)
        self.assertEqual(m['cell']['parameters'][-1],120)
        self.assertEqual(len(m['atoms']),1)

    def test_pdb_and_mmcif(self):
        pdb=('HETATM    1  C1  LIG A   1       0.000   0.000   0.000  1.00 20.00           C  \n'
             'HETATM    2  O1  LIG A   1       1.400   0.000   0.000  1.00 20.00           O  \n'
             'CONECT    1    2\nCONECT    2    1\nEND\n')
        m=parse_structure('a.pdb',pdb)
        self.assertEqual(len(m['atoms']),2)
        self.assertEqual(len(m['bonds']),1)
        self.assertFalse(m['bonds'][0]['inferred'])
        import gemmi
        cif=gemmi.read_pdb_string(pdb).make_mmcif_document().as_string()
        self.assertEqual(len(parse_structure('a.mmcif',cif)['atoms']),2)

    def test_reject_bad_input(self):
        for filename,text in [('a.xyz','2\nx\nC 0 0 0'),('a.xyz','1\nx\nC nan 0 0'),('a.exe','abc'),('a.mol','broken')]:
            with self.assertRaises(ValueError):parse_structure(filename,text)
        with self.assertRaises(ValueError):parse_structure('a.cif',CIF,{'repeats':[99,1,1]})


class Export(unittest.TestCase):
    def test_native_shapes_and_package(self):
        scene={'width':960,'height':540,'items':[
            {'kind':'circle','name':'O 1','x':480,'y':270,'r':25,'color':'#FF0000'},
            {'kind':'line','name':'bond','x1':480,'y1':270,'x2':410,'y2':300,'width':3,'color':'#555555'},
            {'kind':'text','name':'label','x':470,'y':261,'width':20,'height':18,'font':12,'text':'O','color':'#FFFFFF'}]}
        data=make_pptx(scene)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in z.namelist():ET.fromstring(z.read(name))
            root=ET.fromstring(z.read('ppt/slides/slide1.xml'))
            ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
            self.assertEqual(len(root.findall('.//p:sp',ns)),3)
            self.assertEqual(len(root.findall('.//p:pic',ns)),0)
            self.assertEqual(len(root.findall('.//p:grpSp',ns)),1)
            self.assertEqual(root.findall('.//a:xfrm',ns)[3].get('flipH'),'1')

    def test_invalid_scene(self):
        with self.assertRaises(ValueError):validate_scene({'width':960,'height':540,'items':[]})
        with self.assertRaises(ValueError):validate_scene({'width':960,'height':540,'items':[{'kind':'circle','x':float('nan'),'y':0,'r':1,'color':'#FFFFFF'}]})

if __name__=='__main__':unittest.main()
