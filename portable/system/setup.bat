@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

set "SCRIPT_DIR=%~dp0"
set "BASE_DIR=%SCRIPT_DIR%..\"
set "RUNTIME_DIR=%BASE_DIR%app\runtime"
set "CORE_DIR=%BASE_DIR%app\core"
set "NODE_VERSION=22.22.1"
set "OPENCLAW_VERSION=2026.3.13"
set "NODE_SHA256=877cb93829e14fffbbc7903e7d8037336c9a79f3ea43c5d0b8c2379b79da56de"

echo [PocketClaw Setup] === PocketClaw Setup ===

if "%~1"=="openclaw" goto :install_openclaw
if "%~1"=="node" goto :download_node
goto :setup_all

:setup_all
call :download_node
call :install_openclaw
call :setup_data
goto :done

:download_node
set "NODE_DIR=%RUNTIME_DIR%\node-win-x64"
if exist "%NODE_DIR%\node.exe" (
    echo [PocketClaw Setup] Node.js already exists, skipping
    goto :eof
)

echo [PocketClaw Setup] Downloading Node.js v%NODE_VERSION% for Windows x64...
mkdir "%NODE_DIR%" 2>nul

set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"
set "TMPZIP=%TEMP%\node-win-x64.zip"

curl -fSL "%NODE_URL%" -o "%TMPZIP%"
if errorlevel 1 (
    echo [ERROR] Failed to download Node.js
    exit /b 1
)

echo [PocketClaw Setup] Verifying SHA256...
for /f "skip=1 tokens=*" %%h in ('certutil -hashfile "%TMPZIP%" SHA256') do (
    if not defined ACTUAL_HASH set "ACTUAL_HASH=%%h"
)
if /i not "%ACTUAL_HASH%"=="%NODE_SHA256%" (
    echo [ERROR] SHA256 verification failed
    echo   Expected: %NODE_SHA256%
    echo   Got:      %ACTUAL_HASH%
    del "%TMPZIP%"
    exit /b 1
)
echo [PocketClaw Setup] SHA256 verified

powershell -Command "Expand-Archive -Path '%TMPZIP%' -DestinationPath '%TEMP%\node-extract' -Force"
xcopy /E /I /Y "%TEMP%\node-extract\node-v%NODE_VERSION%-win-x64\*" "%NODE_DIR%\"
rd /S /Q "%TEMP%\node-extract"
del "%TMPZIP%"

echo [PocketClaw Setup] Node.js downloaded successfully
goto :eof

:install_openclaw
set "NODE_BIN=%RUNTIME_DIR%\node-win-x64\node.exe"
set "NPM_BIN=%RUNTIME_DIR%\node-win-x64\node_modules\npm\bin\npm-cli.js"

if not exist "%NODE_BIN%" (
    echo [ERROR] Node.js not found. Run setup first with: setup.bat node
    exit /b 1
)

echo [PocketClaw Setup] Installing OpenClaw v%OPENCLAW_VERSION%...
mkdir "%CORE_DIR%" 2>nul

"%NODE_BIN%" "%NPM_BIN%" install --prefix "%CORE_DIR%" "openclaw@%OPENCLAW_VERSION%"
if errorlevel 1 (
    echo [ERROR] Failed to install OpenClaw
    exit /b 1
)

echo [PocketClaw Setup] OpenClaw installed successfully
goto :eof

:setup_data
echo [PocketClaw Setup] Setting up data directories...
mkdir "%BASE_DIR%data\.openclaw" 2>nul
mkdir "%BASE_DIR%data\memory" 2>nul
mkdir "%BASE_DIR%data\backups" 2>nul

if not exist "%BASE_DIR%data\.openclaw\openclaw.json" (
    copy "%BASE_DIR%data\.openclaw\openclaw.json" "%BASE_DIR%data\.openclaw\openclaw.json" 2>nul
)
echo [PocketClaw Setup] Data directories ready
goto :eof

:done
echo [PocketClaw Setup] === Setup Complete ===
endlocal
