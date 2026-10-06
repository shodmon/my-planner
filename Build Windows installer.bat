@echo off
cd /d "%~dp0"
echo Building My Planner installer (needs Node.js from nodejs.org, one time)...
call npm install
call npm run dist
echo.
echo Done. Open the "dist" folder and double-click "My Planner Setup ... .exe".
pause
