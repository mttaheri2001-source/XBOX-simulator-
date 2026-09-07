@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\electron\dist\electron.exe (
  echo Installing dependencies...
  call npm install
)
call npm start
