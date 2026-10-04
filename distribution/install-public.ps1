# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
param([string]$Destination,[switch]$NoShortcuts,[switch]$SkipRegistration,[switch]$Quiet)
$ErrorActionPreference='Stop'
$sourceRoot=Join-Path $PSScriptRoot 'app'
if(-not $Destination){$Destination=Join-Path $env:LOCALAPPDATA 'Programs\AtomWeft\0.3.2'}
$Destination=[IO.Path]::GetFullPath($Destination)
try {
    if(-not [Environment]::Is64BitOperatingSystem){throw 'AtomWeft requires 64-bit Windows 10 or later.'}
    if(-not $SkipRegistration -and (Get-Process POWERPNT -ErrorAction SilentlyContinue)){throw 'Please save your presentations and close PowerPoint, then run the installer again.'}
    if(-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'runtime\python.exe'))){throw 'Installation files are incomplete.'}
    # Do not replace a running editor; old versions can remain installed alongside this version.
    $active=Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($Destination+'\',[StringComparison]::OrdinalIgnoreCase)}
    if($active){throw 'The AtomWeft editor is running from this installation. Close it before reinstalling.'}
    $manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
    foreach($entry in $manifest.files){
        $file=[IO.Path]::GetFullPath((Join-Path $sourceRoot $entry.path))
        if(-not $file.StartsWith([IO.Path]::GetFullPath($sourceRoot)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid manifest path.'}
        if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256){throw "Integrity check failed: $($entry.path)"}
    }
    [void](New-Item -ItemType Directory -Path $Destination -Force)
    Get-ChildItem -LiteralPath $sourceRoot -Force | Copy-Item -Destination $Destination -Recurse -Force
    $python=Join-Path $Destination 'runtime\python.exe'
    & $python -B (Join-Path $Destination 'selfcheck.py')
    if($LASTEXITCODE -ne 0){throw 'Runtime verification failed. Installation registration was not changed.'}
    if(-not $SkipRegistration){& (Join-Path $Destination 'addin\install.ps1') -Prebuilt}
    if(-not $NoShortcuts){
        $shell=New-Object -ComObject WScript.Shell
        $start=Join-Path ([Environment]::GetFolderPath('Programs')) 'AtomWeft'
        [void](New-Item -ItemType Directory -Path $start -Force)
        $link=$shell.CreateShortcut((Join-Path $start 'AtomWeft.lnk'))
        $link.TargetPath=Join-Path $Destination 'runtime\python.exe';$link.Arguments='-B "'+(Join-Path $Destination 'server.py')+'"';$link.WorkingDirectory=$Destination;$link.WindowStyle=7;$link.Save()
        $remove=$shell.CreateShortcut((Join-Path $start 'Uninstall AtomWeft.lnk'))
        $remove.TargetPath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$remove.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $Destination 'uninstall-public.ps1')+'"';$remove.WorkingDirectory=$Destination;$remove.Save()
    }
    if(-not $SkipRegistration){
        $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AtomWeft'
        [void](New-Item -Path $key -Force)
        foreach($pair in @{DisplayName='AtomWeft';DisplayVersion='0.3.2';InstallLocation=$Destination;UninstallString=('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $Destination 'uninstall-public.ps1')+'"')}.GetEnumerator()){Set-ItemProperty -Path $key -Name $pair.Key -Value $pair.Value}
    }
    if(-not $SkipRegistration){& (Join-Path $Destination 'migrate-legacy.ps1')}
    "Installed: $Destination"
} catch {Write-Error $_;exit 1}
