# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
$ErrorActionPreference='Stop'
if(Get-Process POWERPNT -ErrorAction SilentlyContinue){throw 'Please close PowerPoint before removing the add-in.'}
# Leave files and user projects intact; remove this registration only when it points here.
$clsid='HKCU:\Software\Classes\CLSID\{4BE86AD6-219F-4A1D-A8D8-AE33C54DF52F}\InprocServer32'
$registered=(Get-ItemProperty $clsid -ErrorAction SilentlyContinue).CodeBase
$expected=([Uri](Join-Path $PSScriptRoot 'addin\AtomWeftAddIn.dll')).AbsoluteUri
if($registered -eq $expected){
    & (Join-Path $PSScriptRoot 'addin\uninstall.ps1')
    $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AtomWeft'
    if(Test-Path $key){Remove-Item -LiteralPath $key}
    $start=Join-Path ([Environment]::GetFolderPath('Programs')) 'AtomWeft'
    foreach($name in @('AtomWeft.lnk','Uninstall AtomWeft.lnk')){$path=Join-Path $start $name;if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}}
}
Write-Host 'AtomWeft add-in registration removed. Application files and saved projects are retained.'
