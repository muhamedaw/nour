@echo off
setlocal enabledelayedexpansion
title Builder OS Launcher
color 0A

echo.
echo  ================================================
echo   BUILDER OS v1 - Production Dev Environment
echo  ================================================
echo.

:: BuilderOS root = folder this .bat lives in (no hardcoded user path)
set "BOS_ROOT=%~dp0"
if "%BOS_ROOT:~-1%"=="\" set "BOS_ROOT=%BOS_ROOT:~0,-1%"

:: Accept project path as argument (drag folder onto bat file)
set "PROJECT_PATH=%~1"

if "%PROJECT_PATH%"=="" (
    echo  What do you want to do?
    echo.
    echo  [1] Open existing project in VS Code
    echo  [2] Create new project with Builder OS
    echo  [3] Run audit on a project
    echo  [4] Open Builder OS folder
    echo.
    set /p "CHOICE=  Choose (1-4): "
) else (
    set "CHOICE=1"
)

if "!CHOICE!"=="1" goto :existing_project
if "!CHOICE!"=="2" goto :new_project
if "!CHOICE!"=="3" goto :audit_project
if "!CHOICE!"=="4" goto :open_folder
goto :invalid

:existing_project
if "!PROJECT_PATH!"=="" (
    echo.
    set /p "PROJECT_PATH=  Project path: "
    set "PROJECT_PATH=!PROJECT_PATH:"=!"
)
if not exist "!PROJECT_PATH!" (
    echo.
    echo  ERROR: Path does not exist.
    pause
    exit /b 1
)
echo.
echo  Syncing BuilderOS into project (idempotent)...
powershell -ExecutionPolicy Bypass -File "!BOS_ROOT!\setup.ps1" "!PROJECT_PATH!"
echo.
echo  Opening VS Code in: !PROJECT_PATH!
code "!PROJECT_PATH!"
goto :end

:new_project
echo.
set /p "NEW_PATH=  New project path: "
set "NEW_PATH=!NEW_PATH:"=!"
echo.
echo  Initializing Builder OS...
powershell -ExecutionPolicy Bypass -File "!BOS_ROOT!\scripts\new-project.ps1" "!NEW_PATH!"
echo.
echo  Opening VS Code...
code "!NEW_PATH!"
goto :end

:audit_project
echo.
set /p "AUDIT_PATH=  Project path to audit: "
set "AUDIT_PATH=!AUDIT_PATH:"=!"
echo.
powershell -ExecutionPolicy Bypass -File "!BOS_ROOT!\scripts\audit.ps1" "!AUDIT_PATH!"
echo.
pause
goto :end

:open_folder
explorer "!BOS_ROOT!"
goto :end

:invalid
echo  Invalid choice.
pause
exit /b 1

:end
endlocal
