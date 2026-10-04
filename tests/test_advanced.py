# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
import json,unittest,zipfile,io
from pathlib import Path
from xml.etree import ElementTree as ET
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from powerpoint import make_pptx,validate_scene
class AdvancedExport(unittest.TestCase):
    def test_polygon_alpha_soft_edge_are_editable_drawingml(self):
        scene=json.loads((Path(__file__).resolve().parents[1]/'build/advanced-scene.json').read_text(encoding='utf-8'))
        archive=zipfile.ZipFile(io.BytesIO(make_pptx(scene)))
        ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
        root=ET.fromstring(archive.read('ppt/slides/slide1.xml'))
        self.assertEqual(len(root.findall('.//a:custGeom',ns)),len([s for s in scene['items'] if s['kind']=='polygon']))
        self.assertGreater(len(root.findall('.//a:softEdge',ns)),0)
        self.assertTrue(any(int(a.get('val'))<100000 for a in root.findall('.//a:alpha',ns)))
        self.assertFalse(any('/media/' in name for name in archive.namelist()))
    def test_invalid_polygon_and_effects_rejected(self):
        polygon={'kind':'polygon','points':[[0,0],[20,0],[0,20]],'color':'#123456','opacity':.5}
        scene={'width':960,'height':540,'items':[polygon]};validate_scene(scene)
        polygon['opacity']=float('nan')
        with self.assertRaises(ValueError):validate_scene(scene)
        polygon['opacity']=.5;polygon['points']=[[0,0],[1,0],[2,0]]
        with self.assertRaises(ValueError):validate_scene(scene)
if __name__=='__main__':unittest.main()
