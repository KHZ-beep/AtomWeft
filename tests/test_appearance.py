# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
import sys,json,io,zipfile,copy,unittest
from pathlib import Path
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from powerpoint import make_pptx,validate_scene
ROOT=Path(__file__).resolve().parents[1]
NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}

class Appearance(unittest.TestCase):
    def test_all_variants_export_native_geometry(self):
        for variant in json.loads((ROOT/'build/style-variants.json').read_text()):
            with self.subTest(variant=variant['atomDimension']+'/'+variant['bondAppearance']):
                scene=variant['scene'];data=make_pptx(scene)
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    xml=ET.fromstring(z.read('ppt/slides/slide1.xml'))
                    self.assertEqual(len(xml.findall('.//p:sp',NS)),len(scene['items']))
                    self.assertEqual(len(xml.findall('.//p:pic',NS)),0)
                    grads=xml.findall('.//a:gradFill',NS)
                    self.assertEqual(len(grads),4 if variant['atomDimension']=='3d' else 0)
                    if grads:
                        self.assertEqual(grads[0].find('a:lin',NS).get('ang'),'8100000')
                    rects=xml.findall('.//a:prstGeom[@prst="rect"]',NS)
                    self.assertEqual(len(rects),3 if variant['bondAppearance']=='outline' else 0)

    def test_invalid_appearance_data_is_rejected(self):
        scenes=json.loads((ROOT/'build/style-variants.json').read_text())
        scene=next(v['scene'] for v in scenes if v['atomDimension']=='3d')
        for value in (float('nan'),-1,2):
            bad=copy.deepcopy(scene)
            shape=next(s for s in bad['items'] if 'gradient' in s)
            shape['gradient']['stops'][0]['opacity']=value
            with self.assertRaises(ValueError):validate_scene(bad)
        for field,value in [('rotation',float('inf')),('strokeWidth',-1),('stroke','red')]:
            bad=copy.deepcopy(scene);bad['items'][0][field]=value
            with self.assertRaises(ValueError):validate_scene(bad)

if __name__=='__main__':unittest.main()
