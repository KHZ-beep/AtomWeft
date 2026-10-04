# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
from pathlib import Path
import sys,unittest,json,math
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from chemistry import parse_structure
ROOT=Path(__file__).resolve().parents[1]
def load(name):return parse_structure(name,(ROOT/'tests/fixtures'/name).read_text())
class Coordination(unittest.TestCase):
    def test_explicit_table_and_inversion_precede_distance(self):
        m=load('coordination-explicit.cif');s=m['coordination']['shells'][0]
        self.assertEqual(s['source'],'cif-bonds');self.assertEqual(len(s['vertices']),6)
        self.assertNotIn('Oextra',{v['label'] for v in s['vertices']})
        self.assertTrue(any(v['xyz'][0]<0 for v in s['vertices']))
        self.assertTrue(all(abs(math.dist(s['origin'],v['xyz'])-2)<1e-6 for v in s['vertices']))
        (ROOT/'build/cif-coordination-model.json').write_text(json.dumps(m),encoding='utf-8')
    def test_periodic_cell_completes_boundary_octahedron(self):
        m=load('perovskite.cif')
        ti=next(s for s in m['coordination']['shells'] if m['atoms'][s['center']]['element']=='Ti')
        self.assertEqual(len(ti['vertices']),6)
        self.assertEqual(ti['source'],'periodic-distance')
        self.assertTrue(any(v['xyz'][0]<0 for v in ti['vertices']))
        self.assertTrue(all(abs(math.dist(ti['origin'],v['xyz'])-1.9525)<1e-5 for v in ti['vertices']))
    def test_symmetry_code_unit_translation(self):
        text=(ROOT/'tests/fixtures/coordination-explicit.cif').read_text().replace('2_555','1_455')
        m=parse_structure('translate.cif',text)
        self.assertTrue(any(v['xyz'][0]<=-8 for s in m['coordination']['shells'] for v in s['vertices']))
if __name__=='__main__':unittest.main()
