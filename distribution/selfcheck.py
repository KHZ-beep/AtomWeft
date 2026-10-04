# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
import bootstrap
import gemmi, numpy, PIL, pythoncom, win32com.client
from chemistry import parse_structure
from powerpoint import make_pptx
assert len(parse_structure('check.xyz','1\ncheck\nC 0 0 0\n')['atoms'])==1
assert make_pptx({'width':960,'height':540,'items':[{'kind':'circle','x':50,'y':50,'r':20,'color':'#123456'}]})[:2]==b'PK'
print('AtomWeft runtime and editable export: OK')
