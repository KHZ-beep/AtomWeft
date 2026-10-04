# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
$ErrorActionPreference='Stop'
# Remove only our former COM identity, identified by its exact private CLSID
# and assembly name. An unrelated product named MolSlide must not be touched.
$legacyGuid='{D63E5F23-E9FD-4BD3-A3F3-7318A33D6528}'
$legacyHome=$null
$backup=Join-Path $PSScriptRoot ('build\name-migration\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
foreach($bits in @(64,32)){
    $view=if($bits -eq 64){[Microsoft.Win32.RegistryView]::Registry64}else{[Microsoft.Win32.RegistryView]::Registry32}
    $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
    try{
        $prog=$root.OpenSubKey('Software\Classes\MolSlide.Connect\CLSID')
        $inproc=$root.OpenSubKey("Software\Classes\CLSID\$legacyGuid\InprocServer32")
        $owned=$prog -and $inproc -and $prog.GetValue('') -eq $legacyGuid -and $inproc.GetValue('Assembly') -like 'MolSlideAddIn,*'
        if($owned){
            $codeBase=[Uri]$inproc.GetValue('CodeBase')
            if($codeBase.IsFile){$legacyHome=Split-Path (Split-Path $codeBase.LocalPath -Parent) -Parent}
        }
        if($prog){$prog.Close()};if($inproc){$inproc.Close()}
        if(-not $owned){continue}
        [void](New-Item -ItemType Directory -Path $backup -Force)
        $keys=@('Software\Microsoft\Office\PowerPoint\Addins\MolSlide.Connect','Software\Classes\MolSlide.Connect',"Software\Classes\CLSID\$legacyGuid")
        for($i=0;$i -lt $keys.Count;$i++){
            $exists=$root.OpenSubKey($keys[$i]);if(-not $exists){continue};$exists.Close()
            & reg.exe export ('HKCU\'+$keys[$i]) (Join-Path $backup "$bits-$i.reg") /y "/reg:$bits" | Out-Null
            if($LASTEXITCODE -ne 0){throw 'Legacy registration backup failed; old registration was retained.'}
        }
        foreach($key in $keys){$root.DeleteSubKeyTree($key,$false)}
    }finally{$root.Close()}
}
if($legacyHome){
    $entry='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MolSlide'
    if((Get-ItemProperty -LiteralPath $entry -ErrorAction SilentlyContinue).InstallLocation -eq $legacyHome){
        & reg.exe export 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\MolSlide' (Join-Path $backup 'uninstall.reg') /y | Out-Null
        if($LASTEXITCODE -ne 0){throw 'Legacy uninstall entry backup failed.'}
        Remove-Item -LiteralPath $entry
    }
    $shell=New-Object -ComObject WScript.Shell
    $start=Join-Path ([Environment]::GetFolderPath('Programs')) 'MolSlide'
    foreach($name in @('MolSlide.lnk','Uninstall MolSlide.lnk')){
        $path=Join-Path $start $name
        if(-not (Test-Path -LiteralPath $path)){continue}
        $link=$shell.CreateShortcut($path)
        if($link.WorkingDirectory -eq $legacyHome){Copy-Item -LiteralPath $path -Destination $backup;Remove-Item -LiteralPath $path}
    }
    Write-Host 'Previous development name migrated to AtomWeft. Old application files and projects are retained.'
}
