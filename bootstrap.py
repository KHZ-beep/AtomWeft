# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
"""Load dependencies installed beside this application, without global changes."""
import os
import site
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / 'vendor'
_dll_handles = []
if VENDOR.exists():
    site.addsitedir(str(VENDOR))
    for folder in ('win32', 'win32/lib', 'Pythonwin'):
        site.addsitedir(str(VENDOR / folder))
    if os.name == 'nt':
        for folder in ('pywin32_system32', 'win32'):
            p = VENDOR / folder
            if p.exists():
                _dll_handles.append(os.add_dll_directory(str(p)))
