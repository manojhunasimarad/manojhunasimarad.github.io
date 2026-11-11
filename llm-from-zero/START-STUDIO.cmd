@echo off
setlocal
cd /d "%~dp0"
node tools\serve.mjs
if errorlevel 1 pause
