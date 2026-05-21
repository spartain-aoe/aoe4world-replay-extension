@echo off
:: =============================================================
:: AoE4 Replay Launcher - Microsoft Store / Xbox / Game Pass
:: =============================================================
::
:: Usage:
::   install-microsoft-store.bat           - Install the native host
::   install-microsoft-store.bat uninstall - Remove everything
::
:: Source: https://github.com/spartain-aoe/aoe4world-replay-extension
:: =============================================================

if "%1"=="uninstall" goto :uninstall

echo.
echo  AoE4 Replay Launcher - Microsoft Store / Xbox Installer
echo  ========================================================
echo.

set "DIR=%~dp0"

where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: PowerShell not found.
    pause
    exit /b 1
)

echo  Installing Microsoft Store / Xbox launcher to %%LOCALAPPDATA%%\AoE4ReplayLauncher ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& '%DIR%aoe4_replay_setup.ps1' -ExtensionId 'ckkbdeejodfnpehhllhmhhannpgojfec' -Launcher MicrosoftStore"

echo.
echo  Done! You can now use "Watch Replay" on aoe4world.com with the Microsoft Store, Xbox app, or Game Pass version of AoE4.
echo  Note: packaged installs may launch AoE4 normally after saving the replay; open the replay from the in-game Replays menu if it does not auto-play.
echo  To uninstall later, run: install-microsoft-store.bat uninstall
echo.
pause
exit /b 0

:uninstall
echo.
echo  Uninstalling...
set "DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& '%DIR%aoe4_replay_setup.ps1' -Uninstall"
echo  Done. You can delete this folder now.
pause
