@echo off
node "%~dp0scripts\get-todays-commits.js"
if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b 1
)
echo.
echo Now: feed data\todays-commits.json to your AI, save result as data\daily-note.json.
pause