@echo off
rem Builds the Squirrel.Windows installer: Setup.exe, RELEASES and the full .nupkg in dist\squirrel-windows.
call "%~dp0build.bat"
exit /b %errorlevel%
