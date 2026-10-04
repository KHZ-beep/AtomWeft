# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
param([string]$ReportPath)
$ErrorActionPreference='Stop'
$backupFolder=Join-Path $PSScriptRoot 'build\startup-repair'
[void](New-Item -ItemType Directory -Path $backupFolder -Force)
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backupPath=Join-Path $backupFolder "$stamp.json"
$records=@()
$messages=@()
try {
    foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
        $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
        try{
            $disabledPath='Software\Microsoft\Office\16.0\PowerPoint\Resiliency\DisabledItems'
            $disabled=$root.OpenSubKey($disabledPath,$true)
            if($disabled){try{
                foreach($name in $disabled.GetValueNames()){
                    $bytes=$disabled.GetValue($name)
                    if($bytes -isnot [byte[]]){continue}
                    $decoded=[Text.Encoding]::Unicode.GetString($bytes)
                    if($decoded -notmatch '(?i)atomweftaddin\.dll|atomweft\.connect'){continue}
                    $records+=@{view=$view.ToString();path=$disabledPath;name=$name;data=[Convert]::ToBase64String($bytes)}
                    # Write the recovery copy before removing the matching value.
                    ConvertTo-Json -InputObject @($records) -Depth 4 | Set-Content -LiteralPath $backupPath -Encoding UTF8
                    $disabled.DeleteValue($name,$false)
                    $messages+="Removed AtomWeft disabled entry: $name ($view)"
                }
            }finally{$disabled.Close()}}
            $addin=$root.OpenSubKey('Software\Microsoft\Office\PowerPoint\Addins\AtomWeft.Connect',$true)
            if(-not $addin){throw 'AtomWeft is not installed for this user. Run install-addin.cmd first.'}
            try{$addin.SetValue('LoadBehavior',3,[Microsoft.Win32.RegistryValueKind]::DWord)}finally{$addin.Close()}
        }finally{$root.Close()}
    }
    $messages+='Startup registration repaired. Restart PowerPoint to load AtomWeft.'
    if($records.Count){$messages+="Backup: $backupPath"}
}catch{
    $messages+="ERROR: $($_.Exception.Message)"
    throw
}finally{
    $messages | Write-Output
    if($ReportPath){$messages | Set-Content -LiteralPath $ReportPath -Encoding UTF8}
}
