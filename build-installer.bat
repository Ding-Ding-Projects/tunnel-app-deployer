@echo off
rem This project distributes a portable application, without an installation step.
call "%~dp0build.bat"
exit /b %errorlevel%
