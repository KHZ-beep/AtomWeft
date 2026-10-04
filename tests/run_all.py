# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
"""Run portable tests in the required fixture-generation order."""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parents[1]
(root/'build').mkdir(exist_ok=True)
commands=[
 [sys.executable,'tests/test_core.py'],
 [sys.executable,'tests/test_coordination.py'],
 ['node','--test','tests/scene.test.mjs','tests/advanced.test.mjs','tests/depth_coordination.test.mjs'],
 ['node','tests/make_style_gallery.mjs'],
 [sys.executable,'tests/test_appearance.py'],
 [sys.executable,'tests/test_advanced.py'],
]
for command in commands:
    subprocess.run(command,cwd=root,check=True)
