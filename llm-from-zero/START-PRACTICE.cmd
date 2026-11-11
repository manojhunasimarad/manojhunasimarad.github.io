@echo off
setlocal
cd /d "%~dp0"
node tools\launch-native.mjs --port 8770
if errorlevel 1 pause
