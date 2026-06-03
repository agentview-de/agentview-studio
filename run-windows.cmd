@echo off
REM agentView Studio - double-click launcher for Windows.
REM Starts the local dev server (server.mjs); it opens your browser automatically.
REM Stop the server by closing this window or pressing Ctrl-C.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on this PC.
  echo   agentView Studio needs Node 20 or newer to run locally.
  echo   Install it from https://nodejs.org/ and then double-click this file again.
  echo.
  echo   Tip: you can also just open https://studio.agentview.de in your browser.
  echo.
  pause
  exit /b 1
)

node server.mjs
pause
