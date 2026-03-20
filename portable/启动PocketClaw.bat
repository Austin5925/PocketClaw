@echo off
chcp 65001 >nul 2>&1
cls
echo.
echo   PocketClaw
echo.
echo   正在启动，请稍候...
echo   （此窗口为 PocketClaw 运行窗口，请勿关闭）
echo.
set "POCKETCLAW_BASE=%~dp0"
"%~dp0app\runtime\node-win-x64\node.exe" "%~dp0system\server.js" --supervisor
