# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
$ErrorActionPreference = 'Stop'
# Only remove the exact three registration keys owned by this add-in.
foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)) {
    $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
    try {
        $root.DeleteSubKeyTree('Software\Microsoft\Office\PowerPoint\Addins\AtomWeft.Connect',$false)
        $root.DeleteSubKeyTree('Software\Classes\AtomWeft.Connect',$false)
        $root.DeleteSubKeyTree('Software\Classes\CLSID\{4BE86AD6-219F-4A1D-A8D8-AE33C54DF52F}',$false)
    } finally { $root.Close() }
}
Write-Host 'AtomWeft registration removed. Restart PowerPoint. Project files are retained.'
