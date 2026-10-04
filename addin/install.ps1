# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
param([string]$PythonPath,[switch]$Prebuilt)
$ErrorActionPreference = 'Stop'
# Avoid replacing an assembly loaded in PowerPoint. Never close user documents.
$running = $null
try { $running = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { }
if ($running) {
    if ($running.Presentations.Count -gt 0) { throw 'Please save and close PowerPoint presentations, then run this installer again.' }
    $running.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($running)
    $running = $null
    for ($i=0; $i -lt 30 -and (Get-Process POWERPNT -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 200 }
    if (Get-Process POWERPNT -ErrorAction SilentlyContinue) { throw 'PowerPoint is still exiting; run the installer again after it closes.' }
}
if (-not $Prebuilt) { & "$PSScriptRoot\build.ps1" -PythonPath $PythonPath }
$dll = Join-Path $PSScriptRoot 'AtomWeftAddIn.dll'
$assembly = [Reflection.AssemblyName]::GetAssemblyName($dll).FullName
$guid = '{4BE86AD6-219F-4A1D-A8D8-AE33C54DF52F}'
# Register both views so the AnyCPU assembly works with 32- and 64-bit Office.
foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)) {
    $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
    try {
        $class = $root.CreateSubKey("Software\Classes\CLSID\$guid")
        $class.SetValue('', 'AtomWeft PowerPoint Add-in')
        $inproc = $class.CreateSubKey('InprocServer32')
        $inproc.SetValue('', 'mscoree.dll')
        $inproc.SetValue('ThreadingModel','Both')
        $inproc.SetValue('Class','Connect')
        $inproc.SetValue('Assembly',$assembly)
        $inproc.SetValue('RuntimeVersion','v4.0.30319')
        $inproc.SetValue('CodeBase',([Uri]$dll).AbsoluteUri)
        $version = $inproc.CreateSubKey(([Reflection.AssemblyName]::GetAssemblyName($dll).Version.ToString()))
        $version.SetValue('Class','Connect')
        $version.SetValue('Assembly',$assembly)
        $version.SetValue('RuntimeVersion','v4.0.30319')
        $version.SetValue('CodeBase',([Uri]$dll).AbsoluteUri)
        $version.Close()
        $inproc.Close()
        $category = $class.CreateSubKey('Implemented Categories\{62C8FE65-4EBB-45E7-B440-6E39B2CDBF29}')
        $category.Close()
        $prog = $class.CreateSubKey('ProgId'); $prog.SetValue('','AtomWeft.Connect'); $prog.Close(); $class.Close()
        $prog = $root.CreateSubKey('Software\Classes\AtomWeft.Connect'); $prog.SetValue('','Connect'); $prog.Close()
        $prog = $root.CreateSubKey('Software\Classes\AtomWeft.Connect\CLSID'); $prog.SetValue('',$guid); $prog.Close()
        $office = $root.CreateSubKey('Software\Microsoft\Office\PowerPoint\Addins\AtomWeft.Connect')
        $office.SetValue('FriendlyName','AtomWeft')
        $office.SetValue('Description','Editable molecular structures from CIF / MOL / PDB / XYZ')
        $office.SetValue('LoadBehavior',3,[Microsoft.Win32.RegistryValueKind]::DWord)
        $office.Close()
        # Recover only this add-in if an earlier load failed; keep other disabled add-ins unchanged.
        $disabled = $root.OpenSubKey('Software\Microsoft\Office\16.0\PowerPoint\Resiliency\DisabledItems',$true)
        if ($disabled) {
            try {
                foreach ($valueName in $disabled.GetValueNames()) {
                    $bytes = $disabled.GetValue($valueName)
                    if ($bytes -is [byte[]]) {
                        $text = [Text.Encoding]::Unicode.GetString($bytes)
                        if ($text -match '(?i)atomweftaddin\.dll|atomweft\.connect') {
                            $disabled.DeleteValue($valueName,$false)
                            Write-Host 'Removed the previous AtomWeft disabled entry.'
                        }
                    }
                }
            } finally { $disabled.Close() }
        }
    } finally { $root.Close() }
}
Write-Host 'Installed for the current user. Restart PowerPoint to show the AtomWeft tab.'
