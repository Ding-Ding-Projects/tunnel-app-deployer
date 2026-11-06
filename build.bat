@echo off
setlocal
cd /d "%~dp0"
call npm ci
if errorlevel 1 exit /b %errorlevel%
call npm test
if errorlevel 1 exit /b %errorlevel%
call npm run package:win
exit /b %errorlevel%
