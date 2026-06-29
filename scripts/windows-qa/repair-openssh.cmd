@echo off
setlocal EnableExtensions

set "ScriptPath=%~dp0repair-openssh.ps1"

if not exist "%ScriptPath%" (
  echo Missing PowerShell repair script:
  echo %ScriptPath%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ScriptPath%" -PauseOnExit
exit /b %ERRORLEVEL%
