@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%app"
set "DATA_DIR=%SCRIPT_DIR%data"
set "SYSTEM_DIR=%SCRIPT_DIR%system"
set "GATEWAY_PORT=18789"
set "UI_PORT=3210"

set "NODE_BIN=%APP_DIR%\runtime\node-win-x64\node.exe"
set "OPENCLAW_BIN=%APP_DIR%\core\node_modules\.bin\openclaw.cmd"

echo.
echo   ╔══════════════════════════════╗
echo   ║       PocketClaw 启动中      ║
echo   ║    便携 AI 助手 · 插上即用   ║
echo   ╚══════════════════════════════╝
echo.

for /f "usebackq tokens=*" %%v in ("%SCRIPT_DIR%version.txt") do set "VERSION=%%v"
echo [PocketClaw] 版本: %VERSION%

:: 验证运行环境
if not exist "%NODE_BIN%" (
    echo [PocketClaw ERROR] 运行环境不完整：Node.js 未找到。
    echo [PocketClaw ERROR] 请重新获取 PocketClaw 完整版本。
    pause
    exit /b 1
)
if not exist "%OPENCLAW_BIN%" (
    echo [PocketClaw ERROR] 运行环境不完整：AI 引擎未找到。
    echo [PocketClaw ERROR] 请重新获取 PocketClaw 完整版本。
    pause
    exit /b 1
)

set "PATH=%APP_DIR%\runtime\node-win-x64;%PATH%"
set "OPENCLAW_HOME=%DATA_DIR%\.openclaw"

echo [PocketClaw] 正在启动 AI 引擎...
start /b "" "%OPENCLAW_BIN%" gateway --port %GATEWAY_PORT%

set "RETRIES=0"
:wait_gateway
timeout /t 1 /nobreak >nul
curl -sf "http://127.0.0.1:%GATEWAY_PORT%/health" >nul 2>&1
if errorlevel 1 (
    set /a RETRIES+=1
    if !RETRIES! gtr 30 (
        echo [PocketClaw ERROR] AI 引擎启动超时，请重试。
        pause
        exit /b 1
    )
    goto :wait_gateway
)
echo [PocketClaw] AI 引擎已启动

echo [PocketClaw] 正在启动界面...
start /b "" "%NODE_BIN%" "%SYSTEM_DIR%\server.js"
timeout /t 2 /nobreak >nul

echo [PocketClaw] 正在打开浏览器...
start http://localhost:%UI_PORT%

echo.
echo [PocketClaw] PocketClaw 已启动！
echo [PocketClaw] 如果浏览器没有自动打开，请手动访问: http://localhost:%UI_PORT%
echo.
echo 关闭此窗口即可停止 PocketClaw
pause >nul
