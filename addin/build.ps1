# Copyright (c) 2026 KHZ-beep
# SPDX-License-Identifier: MIT
param([string]$PythonPath)
$ErrorActionPreference = 'Stop'
if (-not $PythonPath) { $PythonPath = (Get-Command python.exe).Source }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
& $compiler /nologo /target:library /platform:anycpu /reference:System.Windows.Forms.dll "/out:$PSScriptRoot\AtomWeftAddIn.dll" "$PSScriptRoot\AtomWeftAddIn.cs"
if ($LASTEXITCODE -ne 0) { throw 'COM add-in build failed.' }
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'python-path.txt'), $PythonPath, [Text.UTF8Encoding]::new($false))
Write-Host 'Built AtomWeftAddIn.dll'
