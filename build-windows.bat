@echo off
REM Builds the Windows installer on a Windows PC that has Node.js 22 LTS installed.
cd /d "%~dp0"
call npm install
if errorlevel 1 goto fail
call npm test
if errorlevel 1 goto fail
call npm run dist
if errorlevel 1 goto fail
echo.
echo Done. The installer is in the "dist" folder: MBM-Windows-Setup-1.4.0.exe
pause
exit /b 0
:fail
echo.
echo Build failed. Read the messages above.
pause
exit /b 1
