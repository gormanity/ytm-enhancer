param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string] $InstallerPath,
  [string] $WorkRoot = (Join-Path $env:TEMP "ytm-tray-sac-smoke"),
  [int] $UiReadyTimeoutSeconds = 60,
  [int] $OperationTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

. "$PSScriptRoot\ui-agent-client.ps1"

$HostName = "com.gormanity.ytm_enhancer.tray"
$SacPolicyRegistryPath = "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy"
$SacPolicyValueName = "VerifiedAndReputablePolicyState"
$InstallRoot = Join-Path $env:LOCALAPPDATA "YTM Enhancer\Tray"
$UninstallRegistryKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray"
$StartMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\YTM Enhancer"
$TrayShortcutPath = Join-Path $StartMenuFolder "YTM Tray.lnk"
$UninstallShortcutPath = Join-Path $StartMenuFolder "Uninstall YTM Tray.lnk"
$InstallResultPath = Join-Path $WorkRoot "install-result.json"
$RuntimeResultPath = Join-Path $WorkRoot "runtime-result.json"
$UninstallResultPath = Join-Path $WorkRoot "uninstall-result.json"
$TrayRuntimeLogPath = Join-Path $InstallRoot "tray.log"
$NativeHostRuntimeLogPath = Join-Path $WorkRoot "native-host-runtime.log"
$ProtectedProcessPattern =
  "(?i)(YTM-Tray-[^\\/:]+-Setup\.exe|YTMTray(?:\.NativeHost|\.Setup)?(?:\.exe)?|cmd\.exe|powershell\.exe|pwsh\.exe)"
$BlockingEventLogs = @(
  [pscustomobject] @{
    Name = "Microsoft-Windows-CodeIntegrity/Operational"
    EventIds = @(3033, 3077, 3118)
  },
  [pscustomobject] @{
    Name = "Microsoft-Windows-AppLocker/EXE and DLL"
    EventIds = @(8004, 8022)
  },
  [pscustomobject] @{
    Name = "Microsoft-Windows-AppLocker/MSI and Script"
    EventIds = @(8007, 8029)
  }
)
$NativeRegistryKeys = @{
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" =
    (Join-Path $InstallRoot "$HostName.json")
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName" =
    (Join-Path $InstallRoot "$HostName.json")
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName" =
    (Join-Path $InstallRoot "$HostName.firefox.json")
}

function Write-SmokeStep {
  param([Parameter(Mandatory = $true)][string] $Message)

  Write-Output "[tray-sac-smoke] $Message"
}

function ConvertTo-PowerShellLiteral {
  param([Parameter(Mandatory = $true)][string] $Value)

  return "'" + $Value.Replace("'", "''") + "'"
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)][object] $Expected,
    [Parameter(Mandatory = $true)][object] $Actual,
    [Parameter(Mandatory = $true)][string] $Label
  )

  if ($Expected -ne $Actual) {
    throw "$Label expected '$Expected', got '$Actual'"
  }
}

function Assert-PathExists {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Expected path to exist: $Path"
  }
}

function Assert-PathMissing {
  param([Parameter(Mandatory = $true)][string] $Path)

  if (Test-Path -LiteralPath $Path) {
    throw "Expected path to be absent: $Path"
  }
}

function Assert-AuthenticodeValid {
  param([Parameter(Mandatory = $true)][string] $Path)

  Assert-PathExists $Path
  $Signature = Get-AuthenticodeSignature -LiteralPath $Path
  if (
    $Signature.Status -ne
    [System.Management.Automation.SignatureStatus]::Valid -or
    $null -eq $Signature.SignerCertificate
  ) {
    throw "Expected a valid public-trust Authenticode signature on ${Path}; got $($Signature.Status): $($Signature.StatusMessage)"
  }
}

function Assert-NoInstalledScripts {
  $Scripts = @(
    Get-ChildItem -LiteralPath $InstallRoot -Recurse -File |
      Where-Object { $_.Extension -in @(".cmd", ".ps1") }
  )
  if ($Scripts.Count -gt 0) {
    throw "Expected no installed command or PowerShell scripts; found: $($Scripts.FullName -join ', ')"
  }
}

function Assert-CleanInstallState {
  Assert-PathMissing $InstallRoot
  Assert-PathMissing $UninstallRegistryKey
  Assert-PathMissing $TrayShortcutPath
  Assert-PathMissing $UninstallShortcutPath
  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    Assert-PathMissing $RegistryKey
  }
}

function Test-InstallStateRemaining {
  if (
    (Test-Path -LiteralPath $InstallRoot) -or
    (Test-Path -LiteralPath $UninstallRegistryKey) -or
    (Test-Path -LiteralPath $TrayShortcutPath) -or
    (Test-Path -LiteralPath $UninstallShortcutPath)
  ) {
    return $true
  }

  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    if (Test-Path -LiteralPath $RegistryKey) {
      return $true
    }
  }

  return $false
}

function Set-MarkOfTheWeb {
  param([Parameter(Mandatory = $true)][string] $Path)

  Assert-PathExists $Path
  Set-Content `
    -LiteralPath $Path `
    -Stream "Zone.Identifier" `
    -Value "[ZoneTransfer]`r`nZoneId=3`r`n" `
    -Encoding ASCII `
    -NoNewline

  $ZoneIdentifier = Get-Content `
    -LiteralPath $Path `
    -Stream "Zone.Identifier" `
    -Raw
  if ($ZoneIdentifier -notmatch "(?m)^ZoneId=3\r?$") {
    throw "Could not apply Internet-zone Mark of the Web to $Path."
  }
}

function Get-EventLogCursor {
  param([Parameter(Mandatory = $true)][string] $LogName)

  $Log = Get-WinEvent -ListLog $LogName
  if (-not $Log.IsEnabled) {
    throw "Required Windows event log is disabled: $LogName"
  }

  $LatestEvent = Get-WinEvent `
    -LogName $LogName `
    -MaxEvents 1 `
    -ErrorAction SilentlyContinue
  if ($null -eq $LatestEvent) {
    return [long] 0
  }

  return [long] $LatestEvent.RecordId
}

function Get-BlockingEventLogCursors {
  $Cursors = @{}
  foreach ($Definition in $BlockingEventLogs) {
    $Cursors[$Definition.Name] = Get-EventLogCursor -LogName $Definition.Name
  }
  return $Cursors
}

function Get-NewProtectedProcessBlocks {
  param([Parameter(Mandatory = $true)][hashtable] $Cursors)

  $BlockingEvents = @()
  foreach ($Definition in $BlockingEventLogs) {
    $Cursor = [long] $Cursors[$Definition.Name]
    $EventIdPredicate = @(
      $Definition.EventIds | ForEach-Object { "EventID=$_" }
    ) -join " or "
    $FilterXPath =
      "*[System[(EventRecordID > $Cursor) and ($EventIdPredicate)]]"
    $Events = @(
      Get-WinEvent `
        -LogName $Definition.Name `
        -FilterXPath $FilterXPath `
        -ErrorAction SilentlyContinue
    )

    foreach ($Event in $Events) {
      $SearchText = "$($Event.Message)`n$($Event.ToXml())"
      $NameMatches = @(
        [regex]::Matches($SearchText, $ProtectedProcessPattern) |
          ForEach-Object { $_.Value } |
          Sort-Object -Unique
      )
      if ($NameMatches.Count -eq 0) {
        continue
      }

      $BlockingEvents += [pscustomobject] @{
        LogName = $Definition.Name
        EventId = $Event.Id
        RecordId = $Event.RecordId
        Names = $NameMatches
      }
    }
  }

  return $BlockingEvents
}

function Wait-ForNewProtectedProcessBlocks {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable] $Cursors,
    [int] $TimeoutSeconds = 8
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $Events = @(Get-NewProtectedProcessBlocks -Cursors $Cursors)
    if ($Events.Count -gt 0) {
      return $Events
    }

    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $Deadline)

  return @()
}

function Format-BlockingEvents {
  param([Parameter(Mandatory = $true)][object[]] $Events)

  return @(
    $Events | ForEach-Object {
      "$($_.LogName) event=$($_.EventId) record=$($_.RecordId) names=$($_.Names -join ',')"
    }
  ) -join "; "
}

function Invoke-SetupThroughUiAgent {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("uninstall")]
    [string] $Action,
    [Parameter(Mandatory = $true)]
    [string] $SetupPath,
    [Parameter(Mandatory = $true)]
    [string] $ResultPath
  )

  $ScriptLines = @(
    '$ErrorActionPreference = "Stop"',
    "`$SetupPath = $(ConvertTo-PowerShellLiteral $SetupPath)",
    "`$ResultPath = $(ConvertTo-PowerShellLiteral $ResultPath)",
    "`$Arguments = @($(ConvertTo-PowerShellLiteral $Action), '--quiet')",
    "try {",
    '  $Process = Start-Process `',
    '    -FilePath $SetupPath `',
    '    -ArgumentList ($Arguments -join " ") `',
    '    -Wait `',
    '    -PassThru',
    '  $ExitCode = $Process.ExitCode',
    '  if ($ExitCode -ne 0) {',
    '    throw "$SetupPath exited with code $ExitCode"',
    "  }",
    '  $Payload = @{',
    '    ok = $true',
    '    exitCode = $ExitCode',
    "  }",
    "} catch {",
    '  $Payload = @{',
    '    ok = $false',
    '    error = $_.Exception.ToString()',
    '    scriptStack = $_.ScriptStackTrace',
    "  }",
    "}",
    '$Json = $Payload | ConvertTo-Json -Depth 8 -Compress',
    '[IO.File]::WriteAllText($ResultPath, $Json)'
  )

  Invoke-InteractivePowerShell `
    -Name "TraySac$Action" `
    -ScriptLines $ScriptLines `
    -ResultPath $ResultPath `
    -TimeoutSeconds $OperationTimeoutSeconds | Out-Null
}

function Invoke-InteractiveInstallThroughUiAgent {
  param(
    [Parameter(Mandatory = $true)]
    [string] $SetupPath,
    [Parameter(Mandatory = $true)]
    [int] $ExpectedSessionId
  )

  $InteractiveTimeoutSeconds = ($OperationTimeoutSeconds * 4) + 30
  $ScriptLines = @(
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName UIAutomationClient',
    'Add-Type -AssemblyName UIAutomationTypes',
    "`$SetupPath = $(ConvertTo-PowerShellLiteral $SetupPath)",
    "`$ResultPath = $(ConvertTo-PowerShellLiteral $InstallResultPath)",
    "`$TrayPath = $(ConvertTo-PowerShellLiteral (Join-Path $InstallRoot "YTMTray.exe"))",
    "`$TrayLogPath = $(ConvertTo-PowerShellLiteral $TrayRuntimeLogPath)",
    "`$ExpectedSessionId = $ExpectedSessionId",
    '$InstallerProcess = $null',
    '$InstallerCompleted = $false',
    '$TrayProcess = $null',
    '$DialogProcess = $null',
    '$Payload = $null',
    '$CleanupErrors = @()',
    "try {",
    '  $AgentSessionId = (Get-Process -Id $PID).SessionId',
    '  if ($AgentSessionId -ne $ExpectedSessionId) {',
    '    throw "Installer UI agent is in session $AgentSessionId, expected $ExpectedSessionId."',
    "  }",
    '  Remove-Item -LiteralPath $TrayLogPath -Force -ErrorAction SilentlyContinue',
    '  $env:YTM_TRAY_LOG_PATH = $TrayLogPath',
    '  $InstallerProcess = Start-Process -FilePath $SetupPath -PassThru',
    '  $InstallerStartedAt = $InstallerProcess.StartTime',
    '  $Root = [System.Windows.Automation.AutomationElement]::RootElement',
    '  $WindowCondition = New-Object System.Windows.Automation.PropertyCondition(',
    '    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,',
    '    [System.Windows.Automation.ControlType]::Window',
    "  )",
    '  $Dialog = $null',
    '  $DialogDeadline = (Get-Date).AddSeconds(' +
      "$OperationTimeoutSeconds)",
    "  do {",
    '    foreach ($Candidate in $Root.FindAll(',
    '      [System.Windows.Automation.TreeScope]::Descendants,',
    '      $WindowCondition',
    "    )) {",
    '      if ($Candidate.Current.Name -ne "Install YTM Tray") {',
    "        continue",
    "      }",
    "      try {",
    '        $CandidateProcess = Get-Process `',
    '          -Id $Candidate.Current.ProcessId `',
    '          -ErrorAction Stop',
    '        $CandidateName = [IO.Path]::GetFileName($CandidateProcess.Path)',
    "        if (",
    '          ($CandidateProcess.Id -eq $InstallerProcess.Id -or',
    '            $CandidateName -ieq "YTMTray.Setup.exe") -and',
    '          $CandidateProcess.StartTime -ge $InstallerStartedAt.AddSeconds(-1)',
    "        ) {",
    '          $Dialog = $Candidate',
    '          $DialogProcess = $CandidateProcess',
    "          break",
    "        }",
    "      } catch {}",
    "    }",
    '    if ($null -eq $Dialog) {',
    "      Start-Sleep -Milliseconds 200",
    "    }",
    '  } while ($null -eq $Dialog -and (Get-Date) -lt $DialogDeadline)',
    '  if ($null -eq $Dialog) {',
    '    throw "Interactive installer did not show the Install YTM Tray completion dialog."',
    "  }",
    '  $DialogNames = @(',
    '    $Dialog.FindAll(',
    '      [System.Windows.Automation.TreeScope]::Descendants,',
    '      [System.Windows.Automation.Condition]::TrueCondition',
    "    ) |",
    '      ForEach-Object { $_.Current.Name } |',
    '      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }',
    "  )",
    '  $DialogText = $DialogNames -join "`n"',
    '  $WasSuccessful = $DialogText.Contains(',
    '    "YTM Tray was installed successfully."',
    "  )",
    '  $ButtonCondition = New-Object System.Windows.Automation.PropertyCondition(',
    '    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,',
    '    [System.Windows.Automation.ControlType]::Button',
    "  )",
    '  $OkButton = @(',
    '    $Dialog.FindAll(',
    '      [System.Windows.Automation.TreeScope]::Descendants,',
    '      $ButtonCondition',
    "    ) |",
    '      Where-Object { $_.Current.Name -eq "OK" }',
    '  ) | Select-Object -First 1',
    '  if ($null -eq $OkButton) {',
    '    throw "Installer completion dialog did not expose an OK button. Visible text: $DialogText"',
    "  }",
    '  $ExpectedTrayPath = [IO.Path]::GetFullPath($TrayPath)',
    '  $PrematureTray = @(',
    '    Get-Process YTMTray -ErrorAction SilentlyContinue |',
    '      Where-Object {',
    "        try {",
    '          $_.SessionId -eq $ExpectedSessionId -and',
    '            -not [string]::IsNullOrWhiteSpace($_.Path) -and',
    '            [IO.Path]::GetFullPath($_.Path) -ieq $ExpectedTrayPath',
    "        } catch {",
    '          $false',
    "        }",
    "      }",
    "  )",
    '  if ($PrematureTray.Count -gt 0) {',
    '    throw "YTM Tray launched before the installer completion dialog was dismissed."',
    "  }",
    '  $InvokePattern = $OkButton.GetCurrentPattern(',
    '    [System.Windows.Automation.InvokePattern]::Pattern',
    "  )",
    '  $InvokePattern.Invoke()',
    '  if (-not $WasSuccessful) {',
    '    throw "Installer displayed an unexpected completion dialog: $DialogText"',
    "  }",
    '  if (-not $InstallerProcess.WaitForExit(' +
      "($OperationTimeoutSeconds * 1000))) {",
    '    throw "Combined installer did not exit after its success dialog was dismissed."',
    "  }",
    '  if ($InstallerProcess.ExitCode -ne 0) {',
    '    throw "Combined installer exited with code $($InstallerProcess.ExitCode)."',
    "  }",
    '  $TrayDeadline = (Get-Date).AddSeconds(' +
      "$OperationTimeoutSeconds)",
    "  do {",
    '    $Candidates = @(',
    '      Get-Process YTMTray -ErrorAction SilentlyContinue |',
    '        Where-Object {',
    "          try {",
    '            $_.SessionId -eq $ExpectedSessionId -and',
    '              -not [string]::IsNullOrWhiteSpace($_.Path) -and',
    '              [IO.Path]::GetFullPath($_.Path) -ieq $ExpectedTrayPath',
    "          } catch {",
    '            $false',
    "          }",
    "        }",
    "    )",
    '    if ($Candidates.Count -eq 1) {',
    '      $TrayProcess = $Candidates[0]',
    "      break",
    "    }",
    '    if ($Candidates.Count -gt 1) {',
    '      throw "Installer launched multiple installed YTM Tray processes: $($Candidates.Id -join '', '')."',
    "    }",
    "    Start-Sleep -Milliseconds 200",
    '  } while ((Get-Date) -lt $TrayDeadline)',
    '  if ($null -eq $TrayProcess) {',
    '    throw "Installer did not launch the installed YTM Tray app in session $ExpectedSessionId."',
    "  }",
    '  foreach ($ProbeDelay in @(500, 1000)) {',
    "    Start-Sleep -Milliseconds `$ProbeDelay",
    "    `$TrayProcess.Refresh()",
    "    if (`$TrayProcess.HasExited) {",
    '      throw "Installer-launched YTM Tray exited with code $($TrayProcess.ExitCode)."',
    "    }",
    "  }",
    '  $InstallerCompleted = $true',
    '  $Payload = @{',
    '    ok = $true',
    '    installerPid = $InstallerProcess.Id',
    '    trayPid = $TrayProcess.Id',
    '    traySessionId = $TrayProcess.SessionId',
    "  }",
    "} catch {",
    '  $Payload = @{',
    '    ok = $false',
    '    error = $_.Exception.ToString()',
    '    scriptStack = $_.ScriptStackTrace',
    "  }",
    "} finally {",
    '  if ($null -ne $TrayProcess) {',
    '    $TrayProcess.Dispose()',
    "  }",
    '  if ($null -ne $InstallerProcess) {',
    "    try {",
    '      $InstallerProcess.Refresh()',
    '      if (-not $InstallerCompleted -and -not $InstallerProcess.HasExited) {',
    "        try {",
    '          $TreeKill = Start-Process `',
    '            -FilePath taskkill.exe `',
    '            -ArgumentList @(',
    '              "/PID",',
    '              $InstallerProcess.Id.ToString(),',
    '              "/T",',
    '              "/F"',
    '            ) `',
    '            -Wait `',
    '            -PassThru `',
    '            -WindowStyle Hidden',
    "          try {",
    '            [void]$TreeKill.ExitCode',
    "          } finally {",
    '            $TreeKill.Dispose()',
    "          }",
    "        } catch {",
    "        }",
    "      }",
    "    } catch {",
    '      $CleanupErrors += $_.Exception.Message',
    "    }",
    "  }",
    '  if (-not $InstallerCompleted) {',
    '    $StoppedProcessIds = @()',
    '    foreach ($TrackedProcess in @($DialogProcess, $InstallerProcess)) {',
    '      if ($null -eq $TrackedProcess) {',
    "        continue",
    "      }",
    "      try {",
    '        $TrackedProcessId = $TrackedProcess.Id',
    '        if ($StoppedProcessIds -contains $TrackedProcessId) {',
    "          continue",
    "        }",
    '        $StoppedProcessIds += $TrackedProcessId',
    '        $TrackedProcess.Refresh()',
    '        if (-not $TrackedProcess.HasExited) {',
    "          try {",
    '            $TrackedProcess.Kill()',
    "          } catch {",
    '            $TrackedProcess.Refresh()',
    '            if (-not $TrackedProcess.HasExited) {',
    "              throw",
    "            }",
    "          }",
    '          if (-not $TrackedProcess.WaitForExit(5000)) {',
    '            throw "Process $TrackedProcessId did not exit during installer cleanup."',
    "          }",
    "        }",
    "      } catch {",
    '        $CleanupErrors += $_.Exception.Message',
    "      }",
    "    }",
    "  }",
    '  foreach ($TrackedProcess in @($DialogProcess, $InstallerProcess)) {',
    '    if ($null -ne $TrackedProcess) {',
    "      try {",
    '        $TrackedProcess.Dispose()',
    "      } catch {}",
    "    }",
    "  }",
    '  if ($CleanupErrors.Count -gt 0) {',
    '    $PrimaryMessage = if ($null -ne $Payload.error) {',
    '      [string]$Payload.error',
    "    } else {",
    '      "Interactive installer cleanup failed."',
    "    }",
    '    $Payload = @{',
    '      ok = $false',
    '      error = "$PrimaryMessage Cleanup: $($CleanupErrors -join ''; '')"',
    "    }",
    "  }",
    "}",
    '$Json = $Payload | ConvertTo-Json -Depth 8 -Compress',
    '[IO.File]::WriteAllText($ResultPath, $Json)'
  )

  return Invoke-InteractivePowerShell `
    -Name "TraySacInstall" `
    -ScriptLines $ScriptLines `
    -ResultPath $InstallResultPath `
    -TimeoutSeconds $InteractiveTimeoutSeconds
}

function Invoke-InstalledRuntimeThroughUiAgent {
  $ScriptLines = @(
    '$ErrorActionPreference = "Stop"',
    "`$InstallRoot = $(ConvertTo-PowerShellLiteral $InstallRoot)",
    "`$ResultPath = $(ConvertTo-PowerShellLiteral $RuntimeResultPath)",
    "`$TrayLogPath = $(ConvertTo-PowerShellLiteral $TrayRuntimeLogPath)",
    "`$NativeHostLogPath = $(ConvertTo-PowerShellLiteral $NativeHostRuntimeLogPath)",
    '$TrayPath = Join-Path $InstallRoot "YTMTray.exe"',
    '$NativeHostPath = Join-Path $InstallRoot "YTMTray.NativeHost.exe"',
    '$TrayProcess = $null',
    '$NativeHostProcess = $null',
    '$Payload = $null',
    '$CleanupErrors = @()',
    '$AgentSessionId = (Get-Process -Id $PID).SessionId',
    "function Wait-ForRuntimeLog {",
    "  param(",
    '    [Parameter(Mandatory = $true)][string] $Label,',
    '    [Parameter(Mandatory = $true)][string] $LogPath,',
    '    [Parameter(Mandatory = $true)][string[]] $Markers,',
    '    [Parameter(Mandatory = $true)]',
    '    [System.Diagnostics.Process] $Process,',
    '    [Parameter(Mandatory = $true)][datetime] $Deadline',
    "  )",
    "  while ((Get-Date) -lt `$Deadline) {",
    "    `$Process.Refresh()",
    "    if (`$Process.HasExited) {",
    '      throw "$Label exited with code $($Process.ExitCode)."',
    "    }",
    '    $Contents = if (Test-Path -LiteralPath $LogPath) {',
    "      Get-Content -LiteralPath `$LogPath -Raw",
    "    } else {",
    '      ""',
    "    }",
    '    $MissingMarkers = @(',
    "      `$Markers | Where-Object { -not `$Contents.Contains(`$_) }",
    "    )",
    "    if (`$MissingMarkers.Count -eq 0) {",
    "      return",
    "    }",
    "    Start-Sleep -Milliseconds 100",
    "  }",
    '  throw "$Label did not log: $($MissingMarkers -join '', '')."',
    "}",
    "try {",
    '  Remove-Item `',
    '    -LiteralPath $NativeHostLogPath `',
    '    -Force `',
    '    -ErrorAction SilentlyContinue',
    '  $Deadline = (Get-Date).AddSeconds(' +
      "$OperationTimeoutSeconds)",
    '  $ExpectedTrayPath = [IO.Path]::GetFullPath($TrayPath)',
    '  do {',
    '    $TrayProcesses = @(',
    '      Get-Process YTMTray -ErrorAction SilentlyContinue |',
    '        Where-Object {',
    '          try {',
    '            $_.SessionId -eq $AgentSessionId -and',
    '              -not [string]::IsNullOrWhiteSpace($_.Path) -and',
    '              [IO.Path]::GetFullPath($_.Path) -ieq $ExpectedTrayPath',
    '          } catch {',
    '            $false',
    '          }',
    '        }',
    '    )',
    '    if ($TrayProcesses.Count -eq 1) {',
    '      $TrayProcess = $TrayProcesses[0]',
    '      break',
    '    }',
    '    if ($TrayProcesses.Count -gt 1) {',
    '      throw "Installer launched multiple YTM Tray processes: $($TrayProcesses.Id -join '', '')."',
    '    }',
    '    Start-Sleep -Milliseconds 100',
    '  } while ((Get-Date) -lt $Deadline)',
    '  if ($null -eq $TrayProcess) {',
    '    throw "Installer did not launch the installed YTM Tray app in session $AgentSessionId."',
    '  }',
    '  Wait-ForRuntimeLog `',
    '    -Label "tray" `',
    '    -LogPath $TrayLogPath `',
    '    -Markers @(',
    '      "starting YTM Tray",',
    '      "bridge server listening pipe="',
    '    ) `',
    '    -Process $TrayProcess `',
    '    -Deadline $Deadline',
    '  $NativeHostStartInfo = [System.Diagnostics.ProcessStartInfo]::new()',
    '  $NativeHostStartInfo.FileName = $NativeHostPath',
    '  $NativeHostStartInfo.UseShellExecute = $false',
    '  $NativeHostStartInfo.CreateNoWindow = $true',
    '  $NativeHostStartInfo.RedirectStandardInput = $true',
    '  $NativeHostStartInfo.RedirectStandardOutput = $true',
    '  $NativeHostStartInfo.RedirectStandardError = $true',
    '  $NativeHostStartInfo.EnvironmentVariables["YTM_TRAY_LOG_PATH"] = `',
    '    $NativeHostLogPath',
    '  $NativeHostProcess = [System.Diagnostics.Process]::new()',
    '  $NativeHostProcess.StartInfo = $NativeHostStartInfo',
    '  if (-not $NativeHostProcess.Start()) {',
    '    throw "Could not start $NativeHostPath."',
    "  }",
    '  Wait-ForRuntimeLog `',
    '    -Label "native host" `',
    '    -LogPath $NativeHostLogPath `',
    '    -Markers @(',
    '      "starting YTM Tray native host",',
    '      "bridge client connected pipe=",',
    '      "native messaging relay starting"',
    '    ) `',
    '    -Process $NativeHostProcess `',
    '    -Deadline $Deadline',
    '  Wait-ForRuntimeLog `',
    '    -Label "tray bridge" `',
    '    -LogPath $TrayLogPath `',
    '    -Markers @("bridge server accepted native host") `',
    '    -Process $TrayProcess `',
    '    -Deadline $Deadline',
    '  $TrayProcess.Refresh()',
    '  $NativeHostProcess.Refresh()',
    '  if ($TrayProcess.HasExited -or $NativeHostProcess.HasExited) {',
    '    throw "Installed runtime did not remain active after the handshake."',
    "  }",
    '  $Payload = @{',
    '    ok = $true',
    '    trayPid = $TrayProcess.Id',
    '    traySessionId = $TrayProcess.SessionId',
    '    nativeHostPid = $NativeHostProcess.Id',
    '    nativeHostSessionId = $NativeHostProcess.SessionId',
    "  }",
    "} catch {",
    '  $Payload = @{',
    '    ok = $false',
    '    error = $_.Exception.ToString()',
    '    scriptStack = $_.ScriptStackTrace',
    "  }",
    "} finally {",
    '  if ($null -ne $NativeHostProcess) {',
    "    try {",
    '      try { $NativeHostProcess.StandardInput.Close() } catch {}',
    '      $NativeHostProcess.Refresh()',
    '      if (-not $NativeHostProcess.HasExited) {',
    '        $NativeHostProcess.Kill()',
    '        if (-not $NativeHostProcess.WaitForExit(5000)) {',
    '          throw "Native host did not stop after the runtime probe."',
    "        }",
    "      }",
    "    } catch {",
    '      $CleanupErrors += $_.Exception.Message',
    "    } finally {",
    '      $NativeHostProcess.Dispose()',
    "    }",
    "  }",
    '  if ($null -ne $TrayProcess) {',
    "    try {",
    '      $TrayProcess.Refresh()',
    '      if (-not $TrayProcess.HasExited) {',
    '        $TrayProcess.Kill()',
    '        if (-not $TrayProcess.WaitForExit(5000)) {',
    '          throw "Tray app did not stop after the runtime probe."',
    "        }",
    "      }",
    "    } catch {",
    '      $CleanupErrors += $_.Exception.Message',
    "    } finally {",
    '      $TrayProcess.Dispose()',
    "    }",
    "  }",
    '  if ($CleanupErrors.Count -gt 0) {',
    '    $CleanupMessage = $CleanupErrors -join "; "',
    '    if ($Payload.ok) {',
    '      $Payload = @{',
    '        ok = $false',
    '        error = "Runtime cleanup failed: $CleanupMessage"',
    '        scriptStack = ""',
    "      }",
    "    } else {",
    '      $Payload.error += " Runtime cleanup failed: $CleanupMessage"',
    "    }",
    "  }",
    "}",
    '$Json = $Payload | ConvertTo-Json -Depth 8 -Compress',
    '[IO.File]::WriteAllText($ResultPath, $Json)'
  )

  return Invoke-InteractivePowerShell `
    -Name "TraySacRuntime" `
    -ScriptLines $ScriptLines `
    -ResultPath $RuntimeResultPath `
    -TimeoutSeconds ($OperationTimeoutSeconds + 15)
}

function Wait-ForCleanInstallState {
  $Deadline = (Get-Date).AddSeconds($OperationTimeoutSeconds)
  while ((Get-Date) -lt $Deadline -and (Test-InstallStateRemaining)) {
    Start-Sleep -Milliseconds 250
  }

  Assert-CleanInstallState
}

function Assert-InstalledRelease {
  param(
    [Parameter(Mandatory = $true)]
    [string] $ExpectedVersion
  )

  $TrayPath = Join-Path $InstallRoot "YTMTray.exe"
  $NativeHostPath = Join-Path $InstallRoot "YTMTray.NativeHost.exe"
  $SetupPath = Join-Path $InstallRoot "YTMTray.Setup.exe"
  $ReleaseMetadataPath = Join-Path $InstallRoot "release.json"

  Assert-PathExists $TrayPath
  Assert-PathExists $NativeHostPath
  Assert-PathExists $SetupPath
  Assert-PathExists $ReleaseMetadataPath
  Assert-PathExists (Join-Path $InstallRoot "$HostName.json")
  Assert-PathExists (Join-Path $InstallRoot "$HostName.firefox.json")
  Assert-PathExists $UninstallRegistryKey
  Assert-PathExists $TrayShortcutPath
  Assert-PathExists $UninstallShortcutPath
  Assert-NoInstalledScripts

  Assert-AuthenticodeValid $TrayPath
  Assert-AuthenticodeValid $NativeHostPath
  Assert-AuthenticodeValid $SetupPath

  $InstalledMetadata = Get-Content -LiteralPath $ReleaseMetadataPath -Raw |
    ConvertFrom-Json
  Assert-Equal $ExpectedVersion $InstalledMetadata.version "installed version"

  $UninstallEntry = Get-ItemProperty -LiteralPath $UninstallRegistryKey
  Assert-Equal $InstallRoot $UninstallEntry.InstallLocation "install location"
  Assert-Equal `
    "`"$SetupPath`" uninstall --quiet" `
    $UninstallEntry.QuietUninstallString `
    "native quiet uninstall command"

  foreach ($RegistryKey in $NativeRegistryKeys.Keys) {
    Assert-PathExists $RegistryKey
    $ManifestPath = (Get-Item -LiteralPath $RegistryKey).GetValue("")
    Assert-Equal `
      $NativeRegistryKeys[$RegistryKey] `
      $ManifestPath `
      "$RegistryKey manifest path"
  }
}

if ($UiReadyTimeoutSeconds -le 0) {
  throw "-UiReadyTimeoutSeconds must be greater than zero."
}
if ($OperationTimeoutSeconds -le 0) {
  throw "-OperationTimeoutSeconds must be greater than zero."
}

$ResolvedInstallerPath = (Resolve-Path -LiteralPath $InstallerPath).ProviderPath
$InstallerFileName = [IO.Path]::GetFileName($ResolvedInstallerPath)
if (
  [IO.Path]::GetExtension($ResolvedInstallerPath) -ine ".exe" -or
  $InstallerFileName -notmatch "^YTM-Tray-(?<Version>[0-9]+\.[0-9]+\.[0-9]+)-Setup\.exe$"
) {
  throw "-InstallerPath must point to a versioned YTM-Tray-X.Y.Z-Setup.exe."
}
$ExpectedVersion = $Matches.Version

$ResolvedWorkRoot = [IO.Path]::GetFullPath($WorkRoot)
if (
  $ResolvedInstallerPath.StartsWith(
    $ResolvedWorkRoot + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase
  )
) {
  throw "-InstallerPath must be outside the disposable WorkRoot."
}

$SacPolicy = Get-ItemProperty `
  -LiteralPath $SacPolicyRegistryPath `
  -Name $SacPolicyValueName
$SacPolicyState = [int] $SacPolicy.$SacPolicyValueName
if ($SacPolicyState -ne 1) {
  throw "Smart App Control enforcement is required. $SacPolicyValueName must be 1 (Enforce); got $SacPolicyState."
}

Write-SmokeStep "Smart App Control is in enforcement mode."
Write-SmokeStep "Waiting for the unlocked Windows QA desktop agent."
$UiAgent = Wait-WindowsQaUiAgentReady `
  -TimeoutSeconds $UiReadyTimeoutSeconds
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Assert-Equal $CurrentUser $UiAgent.userName "desktop agent user"
Write-SmokeStep "Desktop agent is ready in session $($UiAgent.sessionId)."

Assert-CleanInstallState

if (Test-Path -LiteralPath $WorkRoot) {
  Remove-Item -LiteralPath $WorkRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

$PrimaryError = $null
$CleanupError = $null
$EventLogCursors = $null
$BlockingEvents = @()
$SmokePassed = $false

try {
  Write-SmokeStep "Applying Internet-zone Mark of the Web to the installer."
  Set-MarkOfTheWeb -Path $ResolvedInstallerPath

  Write-SmokeStep "Verifying the public-trust installer signature."
  Assert-AuthenticodeValid $ResolvedInstallerPath

  $ExpectedRuntimeIdentifier = if (
    $env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or
    $env:PROCESSOR_ARCHITEW6432 -eq "ARM64"
  ) {
    "win-arm64"
  } else {
    "win-x64"
  }

  Write-SmokeStep "Capturing App Control event log cursors."
  $EventLogCursors = Get-BlockingEventLogCursors

  Write-SmokeStep "Driving the marked combined installer through the desktop agent."
  $InstallLaunch = Invoke-InteractiveInstallThroughUiAgent `
    -SetupPath $ResolvedInstallerPath `
    -ExpectedSessionId $UiAgent.sessionId
  Assert-InstalledRelease -ExpectedVersion $ExpectedVersion
  $InstalledMetadata = Get-Content `
    -LiteralPath (Join-Path $InstallRoot "release.json") `
    -Raw |
    ConvertFrom-Json
  Assert-Equal `
    $ExpectedRuntimeIdentifier `
    $InstalledMetadata.runtimeIdentifier `
    "installed runtime"

  Write-SmokeStep "Verifying the installer-launched tray and native host."
  $RuntimeResult = Invoke-InstalledRuntimeThroughUiAgent
  Assert-Equal `
    $InstallLaunch.trayPid `
    $RuntimeResult.trayPid `
    "installer-launched tray process"
  Assert-Equal `
    $UiAgent.sessionId `
    $RuntimeResult.traySessionId `
    "tray runtime session"
  Assert-Equal `
    $UiAgent.sessionId `
    $RuntimeResult.nativeHostSessionId `
    "native host runtime session"

  Write-SmokeStep "Launching the installed native uninstaller."
  Invoke-SetupThroughUiAgent `
    -Action "uninstall" `
    -SetupPath (Join-Path $InstallRoot "YTMTray.Setup.exe") `
    -ResultPath $UninstallResultPath
  Wait-ForCleanInstallState
} catch {
  $PrimaryError = $_
} finally {
  if (Test-InstallStateRemaining) {
    try {
      $InstalledSetupPath = Join-Path $InstallRoot "YTMTray.Setup.exe"
      Assert-AuthenticodeValid $InstalledSetupPath
      Write-SmokeStep "Cleaning up the installed release after smoke failure."
      Invoke-SetupThroughUiAgent `
        -Action "uninstall" `
        -SetupPath $InstalledSetupPath `
        -ResultPath $UninstallResultPath
      Wait-ForCleanInstallState
    } catch {
      $CleanupError = $_
    }
  }

  if ($null -ne $EventLogCursors) {
    $BlockingEvents = @(
      Wait-ForNewProtectedProcessBlocks -Cursors $EventLogCursors
    )
  }

  $SmokePassed =
    $null -eq $PrimaryError -and
    $null -eq $CleanupError -and
    $BlockingEvents.Count -eq 0
  if ($SmokePassed) {
    Remove-Item -LiteralPath $WorkRoot -Recurse -Force
  } else {
    Write-Warning "Retained Smart App Control smoke artifacts at $WorkRoot"
  }
}

if ($BlockingEvents.Count -gt 0) {
  throw "Smart App Control or App Control blocked a protected release process: $(Format-BlockingEvents -Events $BlockingEvents)"
}
if ($null -ne $PrimaryError) {
  throw $PrimaryError
}
if ($null -ne $CleanupError) {
  throw $CleanupError
}

Write-SmokeStep "Smart App Control setup, runtime bridge, and uninstall smoke passed."
