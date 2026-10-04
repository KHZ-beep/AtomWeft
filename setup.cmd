@echo off
cd /d "%~dp0"
python -m pip install --index-url https://pypi.org/simple --target "%~dp0vendor" -r requirements.txt
if errorlevel 1 (pause & exit /b 1)
echo Dependencies ready. Run launch.cmd or install-addin.cmd.
pause
