@echo off
chcp 65001 >nul 2>&1
cls
echo.
echo   口袋龙虾
echo.
echo   正在启动，请稍候...
echo   （此窗口为口袋龙虾运行窗口，请勿关闭）
echo.
set "POCKETCLAW_BASE=%~dp0"
"%~dp0app\runtime\node-win-x64\node.exe" "%~dp0system\server.js" --supervisor
