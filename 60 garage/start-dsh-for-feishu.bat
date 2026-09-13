@echo off
cd /d "%~dp0.."
echo Starting DSH for Feishu workbench...
echo Keep this window open while using Feishu.
echo.
node "%~dp0start-dsh-for-feishu.mjs"
pause
