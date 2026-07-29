import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function runWindowsPowerShell(script: string) {
  const environment = { ...process.env };
  if (process.platform === "win32") {
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === "psmodulepath") {
        delete environment[key];
      }
    }
  }

  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { encoding: "utf8", env: environment },
  );
}

describe("Windows remote QA scaffold", () => {
  it("hashes files without Get-FileHash on Windows PowerShell 5.1", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$start = $sourceText.IndexOf("function Get-YtmeFileSha256")
$end = $sourceText.IndexOf("function Assert-AdministrativePathAcl")
if ($start -lt 0 -or $end -le $start) {
  throw "Portable hash helper boundary was not found."
}
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

$root = Join-Path ([IO.Path]::GetTempPath()) (
  "ytme-portable-hash-" + [guid]::NewGuid().ToString("N")
)
$path = Join-Path $root "fixture.txt"
try {
  New-Item -ItemType Directory -Path $root | Out-Null
  [IO.File]::WriteAllText($path, "abc", [Text.Encoding]::ASCII)
  function Get-FileHash {
    throw "Get-FileHash must not be used."
  }
  $actual = Get-YtmeFileSha256 -Path $path
  if (
    $actual -ne
      "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"
  ) {
    throw "Portable SHA-256 result was incorrect."
  }
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("normalizes native Windows PowerShell module paths for Node fixtures", () => {
    if (process.platform !== "win32") {
      return;
    }

    const modulePathEntries = Object.entries(process.env).filter(
      ([key]) => key.toLowerCase() === "psmodulepath",
    );
    for (const [key] of modulePathEntries) {
      delete process.env[key];
    }
    process.env.PSModulePath = "Z:\\ytme-missing-modules";

    try {
      const result = runWindowsPowerShell(`
$ErrorActionPreference = "Stop"
$modulePaths = @($env:PSModulePath -split ";")
$nativeModulePath = Join-Path $PSHOME "Modules"
if ($modulePaths -contains "Z:\\ytme-missing-modules") {
  throw "The inherited module path reached Windows PowerShell."
}
if ($modulePaths -notcontains $nativeModulePath) {
  throw "Windows PowerShell did not reconstruct its native module path."
}
`);

      expect(result.status, result.stderr).toBe(0);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (key.toLowerCase() === "psmodulepath") {
          delete process.env[key];
        }
      }
      for (const [key, value] of modulePathEntries) {
        process.env[key] = value;
      }
    }
  });

  it("uses generic remote QA account labels", () => {
    const docs = read("docs/remote-qa.md");
    const trayTests = read("apps/windows-tray/tests/YTMTray.Tests/Program.cs");

    expect(docs).toMatch(/such as\s+`<windows-qa-user>`/);
    expect(trayTests).toContain('"install-user"');
    expect(trayTests).toContain('"other-user"');
  });

  it("documents direct and intermediary Windows QA paths", () => {
    const docs = read("docs/remote-qa.md");

    expect(docs).toContain("## Windows QA");
    expect(docs).toContain("physical Windows machine over direct SSH");
    expect(docs).toContain("remote macOS intermediary");
    expect(docs).toContain('REMOTE_QA_WINDOWS_TRANSPORT="direct"');
    expect(docs).toContain('REMOTE_QA_WINDOWS_TRANSPORT="macos"');
    expect(docs).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(docs).toContain("REMOTE_QA_WINDOWS_WORK_ROOT");
    expect(docs).toContain("REMOTE_QA_WINDOWS_PNPM_NODE_LINKER");
    expect(docs).toContain("scripts/remote/windows-qa/run.sh");
    expect(docs).toContain("Windows CLI native messaging QA is not wired yet");
    expect(docs).toContain("scripts/windows-qa/check.ps1");
    expect(docs).toContain("scripts/windows-qa/e2e-edge-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-package-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-release-e2e.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-live-update-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-signing-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-visual-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-release-screenshot.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-button-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-contention-smoke.ps1");
    expect(docs).toContain("install-ui-agent.ps1");
    expect(docs).toContain("WindowsQaAgent");
    expect(docs).toContain("start-ui-agent.cmd");
    expect(docs).toContain("LogonUI");
    expect(docs).toContain("scripts/windows-qa/repair-openssh.cmd");
    expect(docs).toContain("scripts/remote/windows-qa/probe.sh");
    expect(docs).toContain("scripts/remote/windows-qa/tray-smoke.sh");
    expect(docs).toContain("scripts/remote/windows-qa/tray-package-smoke.sh");
    expect(docs).toContain("scripts/remote/windows-qa/tray-release-e2e.sh");
    expect(docs).toContain(
      "scripts/remote/windows-qa/tray-live-update-smoke.sh",
    );
    expect(docs).toContain("scripts/remote/windows-qa/tray-signing-smoke.sh");
    expect(docs).toContain("scripts/remote/windows-qa/tray-visual-smoke.sh");
    expect(docs).toContain(
      "scripts/remote/windows-qa/tray-release-screenshot.sh",
    );
    expect(docs).toContain("scripts/remote/windows-qa/tray-button-smoke.sh");
    expect(docs).toContain(
      "scripts/remote/windows-qa/tray-contention-smoke.sh",
    );
    expect(docs).toContain("Connection timed out during banner exchange");
    expect(docs).toContain("scripts/windows-qa/harden-openssh.ps1");
    expect(docs).toContain("administrators_authorized_keys");
    expect(docs).toContain("Microsoft.DotNet.SDK.10");
    expect(docs).toContain("Windows SDK");
    expect(docs).toContain("signtool.exe");
    expect(docs).toContain("button smoke covers Edge and Firefox");
    expect(docs).toContain(
      "Corepack with `pnpm@11.9.0`, or a global `pnpm@11.9.0` install",
    );
  });

  it("provides a no-sync Windows SSH preflight", () => {
    const probe = read("scripts/remote/windows-qa/probe.sh");

    expect(probe).toContain("REMOTE_QA_WINDOWS_TRANSPORT");
    expect(probe).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(probe).toContain("REMOTE_QA_WINDOWS_USER");
    expect(probe).toContain('ssh -G "$windows_host"');
    expect(probe).toContain("resolve_probe_host");
    expect(probe).toContain(
      'if ! nc -z -w 10 "$probe_host" "$windows_port" >/dev/null 2>&1; then',
    );
    expect(probe).toContain('echo "Windows QA SSH port is unreachable." >&2');
    expect(probe).not.toContain("nc -vz");
    expect(probe).toContain(
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand",
    );
    expect(probe).toContain("REMOTE_QA_CONFIG=/dev/null");
    expect(probe).toContain("scripts/remote/windows-qa/probe.sh");
    expect(probe).not.toContain("tar -czf");

    for (const script of [probe, read("scripts/remote/windows-qa/run.sh")]) {
      expect(script).toContain("-o PreferredAuthentications=publickey");
      expect(script).toContain("-o PasswordAuthentication=no");
      expect(script).toContain("-o KbdInteractiveAuthentication=no");
      expect(script).toContain("-o ForwardAgent=no");
      expect(script).toContain("-o ClearAllForwardings=yes");
      expect(script).toContain("-o StrictHostKeyChecking=yes");
      expect(script).toContain("-o IdentitiesOnly=yes");
      expect(script).toContain("ssh_stderr_file");
      expect(script).toContain('2>"$ssh_stderr_file"');
      expect(script).not.toContain('cat "$ssh_stderr_file" >&2');
      expect(script).toContain('echo "Windows QA SSH command failed." >&2');
    }
  });

  it("provides a user-session Windows UI QA agent probe", () => {
    const common = read("scripts/windows-qa/ui-agent-common.ps1");
    const helper = read("scripts/windows-qa/ui-agent-client.ps1");
    const installer = read("scripts/windows-qa/install-ui-agent.ps1");
    const agent = read("scripts/windows-qa/start-ui-agent.ps1");
    const restarter = read("scripts/windows-qa/restart-ui-agent.ps1");
    const client = read("scripts/windows-qa/invoke-ui-agent.ps1");
    const sacSmoke = read("scripts/windows-qa/tray-sac-smoke.ps1");

    expect(common).toContain("function Get-WindowsQaAgentPipeName");
    expect(common).toContain("function Get-WindowsQaAgentUserFingerprint");
    expect(common).toContain("WindowsIdentity");
    expect(common).toContain("SHA256");
    expect(common).toContain("New-WindowsQaAgentPipeSecurity");
    expect(common).toContain("PipeAccessRule");
    expect(common).toContain("SetAccessRuleProtection");
    expect(common).not.toContain("Identity.User.Value.Replace");
    expect(agent).toContain("NamedPipeServerStream");
    expect(agent).toContain("New-WindowsQaAgentPipeSecurity");
    expect(agent).not.toContain("PipeOptions]::CurrentUserOnly");
    expect(agent).toContain("Set-Location -LiteralPath $env:TEMP");
    expect(agent).toContain("Windows QA UI agent must be started");
    expect(agent).toContain("session 0");
    expect(agent).toContain("Invoke-AgentProbe");
    expect(agent).toContain("Start-Sleep -Seconds 5");
    expect(agent).toContain('-WindowStyle",');
    expect(agent).toContain('"Hidden"');
    expect(agent).not.toContain("notepad.exe");
    expect(agent).toContain("explorerSessionIds");
    expect(agent).toContain("hasExplorerInAgentSession");
    expect(agent).toContain("hasLogonUiInAgentSession");
    expect(agent).toContain("Invoke-AgentLaunch");
    expect(agent).toContain("launch only supports PowerShell script execution");
    expect(agent).toContain("current user's temp directory");
    expect(agent).toContain("ConvertTo-WindowsCommandLineArgument");
    expect(agent).toMatch(/\$Arguments\s+\|\s+ForEach-Object/);
    expect(agent).toContain('-join " "');
    expect(agent).toContain('WindowStyle = "Hidden"');
    expect(agent).toContain("processStillRunning");
    expect(agent).not.toMatch(/\buserName\s*=/);
    expect(agent).not.toMatch(/\buserFingerprint\s*=/);
    expect(agent).not.toMatch(/\bpipeName\s*=/);
    expect(agent).not.toContain("scriptStack = $_.ScriptStackTrace");
    expect(agent).not.toContain("filePath = [string] $Request.filePath");
    expect(agent).not.toContain("Register-ScheduledTask");
    expect(helper).toContain("Get-WindowsQaUiAgentReadiness");
    expect(helper).toContain("Assert-WindowsQaUiAgentReady");
    expect(helper).toContain("Wait-WindowsQaUiAgentReady");
    expect(helper).toContain("Unlock the Windows QA desktop session");
    expect(helper).toContain("Invoke-InteractivePowerShell");
    expect(helper).toContain("invoke-ui-agent.ps1");
    expect(helper).not.toContain("did not create $ResultPath");
    expect(helper).not.toContain("$($Payload.scriptStack)");
    expect(helper).not.toContain("$($Launch.processId)");
    expect(helper).not.toContain("$($Probe.sessionId)");
    expect(helper).toContain("Remove-Item -LiteralPath $ResultPath -Force");
    expect(installer).toContain("YTM Enhancer\\WindowsQaAgent");
    expect(installer).toContain("start-ui-agent.cmd");
    expect(installer).toContain("restart-ui-agent.ps1");
    expect(installer).toContain("Copy-Item");
    expect(installer).not.toContain("agentRoot = $AgentRoot");
    expect(installer).not.toContain("launcherPath = $LauncherPath");
    expect(restarter).toContain("not SSH/session 0");
    expect(restarter).toContain("-Action Shutdown");
    expect(restarter).toContain("Start-Sleep -Seconds 2");
    expect(restarter).toContain("-WindowStyle Hidden");
    expect(restarter).toContain("start-ui-agent.ps1");
    expect(restarter).toContain("$QuotedStartAgentPath");
    expect(restarter).not.toContain("agentRoot = $AgentRoot");
    expect(restarter).not.toContain("$($_.Exception.Message)");
    expect(client).toContain("NamedPipeClientStream");
    expect(client).not.toContain("PipeOptions]::CurrentUserOnly");
    expect(client).toContain("Cannot connect to Windows QA UI agent");
    expect(client).not.toContain("$($_.Exception.Message)");
    expect(client).toContain("LaunchProbe");
    expect(client).not.toContain("LaunchNotepad");
    expect(client).not.toContain("Register-ScheduledTask");
    expect(sacSmoke).not.toContain("$UiAgent.userName");
    expect(sacSmoke).not.toContain("$UiAgent.userFingerprint");
  });

  it("keeps Windows QA status output free of machine-specific details", () => {
    const windowsQaDirectory = resolve(process.cwd(), "scripts/windows-qa");
    const outputSink =
      /(?:\bWrite-(?:Host|Output|Warning|SmokeStep|StatusLine|PreflightSummary)\b|\[Console\]::Out\.WriteLine\s*\()/i;
    const unsafeStatusOutput =
      /\$(?:[A-Za-z][A-Za-z0-9_]*(?:Path|Root|Directory|SessionId|ProcessId|Pid|Url|Uri)\b|[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*(?:Path|Root|Directory|SessionId|ProcessId|Pid|Url|Uri|scrollLog)\b|_\.Exception\.Message|\([^)\r\n]*\.(?:[A-Za-z][A-Za-z0-9_]*(?:Path|Root|Directory|SessionId|ProcessId|Pid|Url|Uri)|scrollLog|Exception\.Message)\b[^)\r\n]*\))/i;
    const offenders = readdirSync(windowsQaDirectory)
      .filter((name) => name.endsWith(".ps1"))
      .flatMap((name) => {
        const lines = read(`scripts/windows-qa/${name}`).split(/\r?\n/);
        const statements: string[] = [];

        for (let index = 0; index < lines.length; index += 1) {
          if (!outputSink.test(lines[index])) {
            continue;
          }

          let statement = lines[index];
          let parenthesisDepth =
            (statement.match(/\(/g)?.length ?? 0) -
            (statement.match(/\)/g)?.length ?? 0);
          while (
            index + 1 < lines.length &&
            (parenthesisDepth > 0 || statement.trimEnd().endsWith("`"))
          ) {
            index += 1;
            statement += `\n${lines[index]}`;
            parenthesisDepth +=
              (lines[index].match(/\(/g)?.length ?? 0) -
              (lines[index].match(/\)/g)?.length ?? 0);
          }
          statements.push(statement);
        }

        return statements
          .filter((statement) => unsafeStatusOutput.test(statement))
          .map((statement) => `${name}: ${statement.trim()}`);
      });

    expect(offenders).toEqual([]);

    const sacSmoke = read("scripts/windows-qa/tray-sac-smoke.ps1");
    const signingSmoke = read("scripts/windows-qa/tray-signing-smoke.ps1");
    const contentionSmoke = read(
      "scripts/windows-qa/tray-contention-smoke.ps1",
    );
    const repair = read("scripts/windows-qa/repair-openssh.ps1");

    expect(sacSmoke).not.toContain("$($UiAgent.sessionId)");
    expect(signingSmoke).not.toContain(
      'Write-SmokeStep "Extracting $ArchivePath."',
    );
    expect(repair).not.toContain(
      "Write-Host $_.Exception.Message -ForegroundColor Red",
    );
    expect(contentionSmoke).not.toContain("processId='{2}'");
    expect(contentionSmoke).not.toContain("activeBrowserPath='{4}'");
    expect(contentionSmoke).not.toContain("ConvertTo-PreflightJson $Summary");
    expect(contentionSmoke).not.toContain("`n$Logs");
    expect(contentionSmoke).not.toContain("`n$EdgeLogs");
    expect(contentionSmoke).not.toContain(
      "$($ContentionFailure.Exception.Message)",
    );
    expect(contentionSmoke).not.toContain("ConvertTo-Json");
  });

  it("provides a clickable Windows OpenSSH repair helper", () => {
    const launcher = read("scripts/windows-qa/repair-openssh.cmd");
    const repair = read("scripts/windows-qa/repair-openssh.ps1");
    const existingFirewallRepair = repair.slice(
      repair.indexOf("$Rule = $Rules[0]"),
      repair.indexOf("if ($RepairAdministratorKeys)"),
    );

    expect(launcher).toContain("repair-openssh.ps1");
    expect(launcher).toContain("-PauseOnExit");
    expect(repair).toContain("Test-IsAdministrator");
    expect(repair).toContain("Start-Process");
    expect(repair).toContain("OpenSSH.Server~~~~0.0.1.0");
    expect(repair).toContain("ssh-keygen.exe -A");
    expect(repair).toContain("Set-Service sshd -StartupType Automatic");
    expect(repair).toContain("Restart-Service sshd -Force");
    expect(repair).toContain("OpenSSH-Server-In-TCP");
    expect(repair).toContain("Get-NetFirewallPortFilter");
    expect(repair).toContain("Get-NetFirewallServiceFilter");
    expect(repair).toContain("Get-NetFirewallApplicationFilter");
    expect(repair).not.toContain(
      "Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue",
    );
    expect(repair).not.toContain(
      "Get-NetFirewallPortFilter -ErrorAction SilentlyContinue",
    );
    expect(repair).toContain("Test-UniversalFirewallRemoteAddress");
    expect(repair).toContain("Test-UnsafeFirewallRemoteAddress");
    expect(repair).toContain('"0.0.0.0/0"');
    expect(repair).toContain('"::/0"');
    expect(repair).toContain('"::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"');
    expect(repair).toContain('"internet"');
    expect(repair).toContain(
      "The existing OpenSSH firewall rule is not safely scoped.",
    );
    expect(repair).toContain("-Profile Private");
    expect(repair).toContain("-RemoteAddress LocalSubnet");
    expect(repair).not.toContain("-Profile Any");
    expect(existingFirewallRepair).toContain(
      "Test-UnsafeFirewallRemoteAddress",
    );
    expect(
      existingFirewallRepair.indexOf("Set-NetFirewallAddressFilter"),
    ).toBeLessThan(existingFirewallRepair.indexOf("Enable-NetFirewallRule"));
    expect(repair).toContain("[switch] $RepairFirewall");
    expect(repair).toContain("if ($RepairFirewall)");
    expect(repair).toContain("[switch] $RepairAdministratorKeys");
    expect(repair).toContain("if ($RepairAdministratorKeys)");
    expect(repair).toContain("administrators_authorized_keys");
    expect(repair).toContain(
      "Test-NetConnection 127.0.0.1 -Port 22 -InformationLevel Quiet",
    );
    expect(repair).not.toContain("Format-Table LocalAddress,LocalPort,State");
    expect(repair).toContain("YTM-Windows-QA-SSH-Repair.log");
    expect(repair).toContain(
      'Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
    );
    expect(repair).toContain(
      'Join-Path $env:SystemRoot "System32\\OpenSSH\\ssh-keygen.exe"',
    );
    expect(repair).toContain(
      'Join-Path $env:SystemRoot "System32\\icacls.exe"',
    );
  });

  it("fails closed around existing OpenSSH firewall filter errors", () => {
    if (process.platform !== "win32") {
      return;
    }

    const repairPath = resolve(
      process.cwd(),
      "scripts/windows-qa/repair-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${repairPath}')
$start = $sourceText.IndexOf("function Test-FirewallRuleTargetsSshd")
$end = $sourceText.IndexOf("if (-not (Test-IsAdministrator))")
if ($start -lt 0 -or $end -le $start) {
  throw "OpenSSH firewall repair helper boundaries were not found."
}
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

$script:FailFilter = ""
function Invoke-FixtureFirewallFilter {
  param(
    [Parameter(Mandatory = $true)][string] $Name,
    [Parameter(Mandatory = $true)] $Value
  )

  if ($script:FailFilter -eq $Name) {
    Write-Error "Injected $Name filter failure."
  }
  return $Value
}
function Get-NetFirewallPortFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process {
    Invoke-FixtureFirewallFilter "port" ([pscustomobject]@{
      Protocol = "TCP"
      LocalPort = "22"
    })
  }
}
function Get-NetFirewallServiceFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process {
    Invoke-FixtureFirewallFilter "service" ([pscustomobject]@{
      Service = "Any"
    })
  }
}
function Get-NetFirewallApplicationFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process {
    Invoke-FixtureFirewallFilter "application" ([pscustomobject]@{
      Program = "Any"
      AppPath = "Any"
      Package = "Any"
    })
  }
}
function Get-NetFirewallAddressFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process {
    Invoke-FixtureFirewallFilter "address" ([pscustomobject]@{
      RemoteAddress = @("LocalSubnet")
    })
  }
}

$rule = [pscustomobject]@{
  Direction = "Inbound"
  Action = "Allow"
  Profile = "Private"
  PackageFamilyName = ""
  PolicyAppId = ""
}
foreach ($filterName in @("port", "service", "application", "address")) {
  $script:FailFilter = $filterName
  $failedClosed = $false
  try {
    Assert-SafeExistingOpenSshFirewallRule $rule | Out-Null
  } catch {
    $failedClosed = $true
  }
  if (-not $failedClosed) {
    throw "A $filterName provider failure was accepted."
  }
}

$script:FailFilter = ""
foreach ($unsafeAddress in @(
  $null,
  "",
  "   ",
  "Any",
  "*",
  "0.0.0.0/0",
  "::/0",
  "0.0.0.0-255.255.255.255",
  "::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "DefaultGateway",
  "DHCP",
  "DNS",
  "Internet",
  "Intranet",
  "PlayToDevice",
  "WINS"
)) {
  if (-not (Test-UnsafeFirewallRemoteAddress $unsafeAddress)) {
    throw "An unsafe firewall address was not recognized."
  }
}
if (Test-UnsafeFirewallRemoteAddress "LocalSubnet") {
  throw "A constrained firewall address was treated as universal."
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("provides rollback-safe Windows OpenSSH hardening", () => {
    const harden = read("scripts/windows-qa/harden-openssh.ps1");
    const docs = read("docs/remote-qa.md");
    const prepareStart = harden.indexOf("function Invoke-Prepare");
    const applyStart = harden.indexOf("function Invoke-Apply");
    const verifyStart = harden.indexOf("function Invoke-Verify");
    const rollbackStart = harden.indexOf("function Invoke-Rollback");
    const prepare = harden.slice(prepareStart, applyStart);
    const apply = harden.slice(applyStart, verifyStart);
    const verify = harden.slice(verifyStart, rollbackStart);
    const rollback = harden.slice(rollbackStart);
    const protectedKeyInstaller = harden.slice(
      harden.indexOf("function Install-ProtectedAuthorizedKey"),
      harden.indexOf("function Get-ActiveFirewallRulesByName"),
    );
    const adminKeyCleanup = harden.slice(
      harden.indexOf("function Remove-QaKeyFromAdministratorAuthorizedKeys"),
      harden.indexOf("function Restore-AdministratorMembership"),
    );
    const stateRollback = harden.slice(
      harden.indexOf("function Invoke-StateRollback"),
      harden.indexOf("function Disable-PreviousFirewallRules"),
    );
    const saveState = harden.slice(
      harden.indexOf("function Save-State"),
      harden.indexOf("function Resolve-StateDirectory"),
    );
    const administratorKeyRestore = harden.slice(
      harden.indexOf("function Restore-AdministratorAuthorizedKeys"),
      harden.indexOf("function Get-CanonicalPublicKey"),
    );
    const stateRootInitialization = harden.slice(
      harden.indexOf("function Initialize-StateRoot"),
      harden.indexOf("function Get-SshdExecutable"),
    );
    const stateResolution = harden.slice(
      harden.indexOf("function Resolve-StateDirectory"),
      harden.indexOf("function Load-State"),
    );
    const candidateConfig = harden.slice(
      harden.indexOf("function Write-CandidateConfig"),
      harden.indexOf("function Invoke-SshdSyntaxCheck"),
    );
    const effectiveConfig = harden.slice(
      harden.indexOf("function Assert-EffectiveSshdConfig"),
      harden.indexOf("function Enter-StateLock"),
    );
    const rollbackRegistration = harden.slice(
      harden.indexOf("function Register-Rollback"),
      harden.indexOf("function Unregister-Rollback"),
    );
    const autoDisableRule = harden.slice(
      harden.indexOf("function Test-RuleIsAutoDisableSshRule"),
      harden.indexOf("function Get-AutoDisableSshRules"),
    );
    const configRestore = harden.slice(
      harden.indexOf("function Restore-SshdConfiguration"),
      harden.indexOf("function Invoke-StateRollback"),
    );
    const firewallRestore = harden.slice(
      harden.indexOf("function Restore-OriginalFirewallRules"),
      harden.indexOf("function Restore-SshGroup"),
    );
    const transactionActive = harden.slice(
      harden.indexOf("function Test-StateTransactionActive"),
      harden.indexOf("function Assert-ConfigUnchangedSincePrepare"),
    );
    const firewallSnapshot = harden.slice(
      harden.indexOf("function Get-FirewallRuleIdentitySnapshot"),
      harden.indexOf("function Test-FirewallRuleMatchesSnapshot"),
    );
    const sshRuleInventory = harden.slice(
      harden.indexOf("function Get-SshPortRules"),
      harden.indexOf("function ConvertTo-SortedFirewallStrings"),
    );
    const disablePreviousFirewall = harden.slice(
      harden.indexOf("function Disable-PreviousFirewallRules"),
      harden.indexOf("function Get-EnabledPreviousFirewallRuleCount"),
    );
    const countPreviousFirewall = harden.slice(
      harden.indexOf("function Get-EnabledPreviousFirewallRuleCount"),
      harden.indexOf("function Get-EnabledBroadSshFirewallRuleCount"),
    );

    expect(harden).toContain(
      '[ValidateSet("Audit", "Prepare", "Apply", "Verify", "Rollback")]',
    );
    expect(harden).toContain("AuthenticationMethods publickey");
    expect(harden).toContain("PasswordAuthentication no");
    expect(harden).toContain("KbdInteractiveAuthentication no");
    expect(harden).toContain("DisableForwarding yes");
    expect(harden).toContain("AllowGroups");
    expect(harden).toContain("sshd.exe");
    expect(harden).toContain('-ArgumentList "-t"');
    expect(harden).toMatch(/-ArgumentList\s+`?\s*"-T"/);
    expect(harden).toContain("Register-ScheduledTask");
    expect(harden).toContain('"SYSTEM"');
    expect(harden).toContain("-AllowStartIfOnBatteries");
    expect(harden).toContain("-DontStopIfGoingOnBatteries");
    expect(harden).toContain("-RestartCount 3");
    expect(harden).toContain("function Assert-RollbackTaskRegistered");
    expect(harden).toContain("Assert-RollbackTaskRegistered");
    expect(harden).toContain("$ExpectedTriggerAt");
    expect(harden).toContain("$Settings.Enabled");
    expect(harden).toContain("MSFT_TaskTimeTrigger");
    expect(harden).toContain("$Trigger.StartBoundary");
    expect(harden).toContain("-ExpectedTriggerAt $TriggerAt");
    expect(harden).toContain(
      'Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
    );
    expect(harden).toContain("-Profile Private");
    expect(harden).toContain("-RemoteAddress $RemoteAddress");
    expect(harden).toContain("Get-NetFirewallPortFilter");
    expect(harden).toContain("Get-NetFirewallAddressFilter");
    expect(harden).not.toContain("-Profile Any");
    expect(harden).toContain("[switch] $ConfirmLocalRecovery");
    expect(harden).toContain("[switch] $ConfirmInitialKeyConnection");
    expect(harden).toContain("[switch] $ConfirmFinalKeyConnection");
    expect(harden).toContain("[ValidateRange(5, 60)]");
    expect(harden).toContain("Assert-QaAccountLoggedOff");
    expect(harden).toContain("Get-CimAssociatedInstance");
    expect(harden).toContain("Disable-LocalUser");
    expect(harden).toContain("Enable-LocalUser");
    expect(harden).toContain("qaAccountDisablePending");
    expect(harden).toContain("qaAccountDisabled");
    expect(harden).toContain("$env:SESSIONNAME");
    expect(harden).toContain("[Environment]::Is64BitProcess");
    expect(harden).toContain("-StartWhenAvailable");
    expect(harden).toContain("administrators_authorized_keys");
    expect(harden).toContain("Get-CanonicalPublicKey");
    expect(harden).toContain("Split-AuthorizedKeyLine");
    expect(harden).toContain("SetSecurityDescriptorSddlForm");
    expect(harden).toContain("configSddl");
    expect(harden).toContain("firewallFinalized = $false");
    expect(harden).toContain("authorizedkeysfile");
    expect(harden).toContain('"user=$UserName,host=localhost,addr=127.0.0.1"');
    expect(harden).toContain("Test-RuleIsExactSshPortRule");
    expect(harden).toContain("Test-RuleTargetsSshd");
    expect(harden).toContain("Test-RuleHasGenericApplicationScope");
    expect(harden).toContain("Get-NetFirewallApplicationFilter");
    expect(harden).toContain("$ApplicationFilter.AppPath");
    expect(harden).toContain("$Rule.PackageFamilyName");
    expect(harden).toContain("Get-AutoDisableSshRules");
    expect(harden).toContain(
      "A broad firewall rule covering SSH requires manual review.",
    );
    expect(harden).toMatch(/Get-LocalUser\s+`\s+-SID/);
    expect(harden).toContain("rollbackFailed = $false");
    expect(harden).toContain("commitPending = $false");
    expect(harden).toContain("function Enter-StateLock");
    expect(harden).toContain('Join-Path $StateRoot "transaction.lock"');
    expect(harden).toContain("$TimeoutSeconds -eq 0");
    expect(harden).toContain("function Assert-NoActiveHardeningTransaction");
    expect(harden).toContain("function Assert-ConfigUnchangedSincePrepare");
    expect(harden).toContain("function Assert-SshGroupContainsOnlyQa");
    expect(harden).toContain("function Assert-AdministrativePathAcl");
    expect(harden).toContain("function Assert-ProtectedStateTree");
    expect(harden).toContain("function Get-YtmeFileSha256");
    expect(harden).not.toContain("Get-FileHash");
    expect(harden).toContain("Win32_Service");
    expect(harden).toContain("LocalSystem");
    expect(harden).toContain(
      'Join-Path $env:WINDIR "System32\\OpenSSH\\sshd.exe"',
    );
    expect(harden).toContain("function Install-ProtectedAuthorizedKey");
    expect(harden).toContain("protectedAuthorizedKeysPath");
    expect(harden).not.toContain("function Install-QaAuthorizedKey");
    expect(harden).not.toContain("function Restore-AuthorizedKey");
    expect(harden).not.toContain("Set-QaSshDirectoryAcl");
    expect(harden).not.toContain("Set-QaAuthorizedKeyAcl");
    expect(harden).not.toContain(".ProfilePath");
    expect(harden).toContain("configSha256");
    expect(transactionActive).toMatch(
      /if \(\[bool\] \$State\.committed\) \{\s+return \$false/,
    );
    expect(transactionActive).toContain("[bool] $State.preparePending");
    expect(saveState).toContain("Replace-FileAtomically");
    expect(saveState).not.toContain("[IO.File]::Replace");
    expect(saveState).toContain("-AllowMissingDestination");
    expect(saveState).not.toContain("[IO.File]::WriteAllText($StatePath");
    expect(saveState).toContain("current-state-");
    expect(saveState).not.toContain(
      "[IO.File]::WriteAllText($CurrentStatePath",
    );
    expect(administratorKeyRestore).toContain(
      "if (-not [bool] $State.administratorKeyModified)",
    );
    expect(administratorKeyRestore).toContain(
      "Get-OriginalAdministratorKeySegmentsBase64",
    );
    expect(administratorKeyRestore).toContain(
      "Get-MatchingAuthorizedKeySegmentsBase64",
    );
    expect(administratorKeyRestore).toContain("Replace-FileAtomically");
    expect(administratorKeyRestore).toContain(
      "The administrator key could not be restored exactly.",
    );
    expect(administratorKeyRestore).not.toContain("Copy-Item");
    expect(harden).toContain("administratorKeyBackupSha256");
    expect(harden).not.toContain("function Add-CanonicalPublicKeyToFile");
    expect(harden).toContain("function Assert-PathHasNoReparsePoint");
    expect(protectedKeyInstaller).toContain("Replace-FileAtomically");
    expect(protectedKeyInstaller).toContain("Set-AdministrativeFileAcl");
    expect(protectedKeyInstaller).toContain("Assert-AdministrativePathAcl");
    expect(candidateConfig).toContain("AuthorizedKeysFile");
    expect(candidateConfig).toContain("$AuthorizedKeysPath");
    expect(effectiveConfig).toContain("$ExpectedAuthorizedKeysPath");
    expect(effectiveConfig).toContain("authorizedkeysfile");
    expect(stateRootInitialization).toContain("Assert-PathHasNoReparsePoint");
    expect(stateRootInitialization).toContain("Assert-ProtectedStateTree");
    expect(stateRootInitialization).toContain("$StateRootMarkerName");
    expect(stateRootInitialization).toContain(
      "[IO.DirectoryInfo]::new($StateRoot)",
    );
    expect(stateRootInitialization).toContain(".Create($DirectoryAcl)");
    expect(stateRootInitialization).not.toContain(".ytme-openssh-state-");
    expect(stateResolution).toContain("Assert-ProtectedStateTree");
    expect(stateResolution).not.toContain("Initialize-StateRoot");
    expect(stateRollback).not.toContain("Restore-AuthorizedKey");
    expect(rollbackRegistration).toContain("Replace-FileAtomically");
    expect(rollbackRegistration).toContain("Get-YtmeFileSha256");
    expect(harden).toContain("[IO.FileShare]::None");
    expect(autoDisableRule).toContain("Test-RuleHasGenericApplicationScope");
    expect(harden).toContain("configModified = $false");
    expect(harden).toContain("previousFirewallRulesModified = $false");
    expect(harden).toContain("administratorMembershipModified = $false");
    expect(harden).toContain("preparePending = $true");
    expect(harden).toContain("restrictedFirewallRuleCreated = $false");
    expect(harden).not.toContain("authorizedKeyAdded");
    expect(harden).not.toContain("authorizedKeyBackupPath");
    expect(harden).toContain("sshGroupCreated");
    expect(harden).toContain("sshGroupMemberAdded");
    expect(configRestore).toContain("if (-not [bool] $State.configModified)");
    expect(configRestore).toContain("configSha256");
    expect(configRestore).toContain("Replace-FileAtomically");
    expect(configRestore).not.toContain("[IO.File]::Replace");
    expect(configRestore).toContain("$ConfigPath.ytme-rollback-");
    expect(configRestore.indexOf("Set-FileAclFromSddl")).toBeLessThan(
      configRestore.indexOf("Replace-FileAtomically"),
    );
    expect(firewallRestore).toContain(
      "if ([bool] $State.previousFirewallRulesModified)",
    );
    expect(firewallRestore).toContain(
      "Remove-NetFirewallRule -InputObject $RestrictedRule",
    );
    expect(firewallRestore).toContain(
      "if (([string] $Rule.Enabled) -eq ([string] $RuleState.enabled))",
    );
    expect(firewallSnapshot).toContain("ruleInstanceId");
    expect(firewallSnapshot).toContain("portFilterInstanceIds");
    expect(firewallSnapshot).toContain("serviceFilterInstanceIds");
    expect(firewallSnapshot).toContain("applicationFilterInstanceIds");
    expect(firewallSnapshot).toContain("addressFilterInstanceIds");
    expect(firewallSnapshot).toContain("interfaceFilterInstanceIds");
    expect(firewallSnapshot).toContain("interfaceTypeFilterInstanceIds");
    expect(firewallSnapshot).toContain("securityFilterInstanceIds");
    expect(firewallSnapshot).toContain("RemoteDynamicKeywordAddresses");
    expect(firewallSnapshot).toContain("Platform");
    expect(sshRuleInventory).not.toContain("-ErrorAction SilentlyContinue");
    expect(sshRuleInventory).toContain("-ErrorAction Stop");
    expect(sshRuleInventory).toContain("$RulesByInstanceId");
    expect(sshRuleInventory).toContain("$Rule.InstanceID");
    expect(sshRuleInventory).toContain(
      "The SSH firewall inventory contains an invalid rule identity.",
    );
    expect(sshRuleInventory).not.toContain("$RulesByName[$Rule.Name]");
    expect(firewallSnapshot).not.toContain("-ErrorAction SilentlyContinue");
    expect(firewallSnapshot).toContain("-ErrorAction Stop");
    expect(disablePreviousFirewall).toContain(
      "Assert-FirewallRuleMatchesSnapshot",
    );
    expect(disablePreviousFirewall).toContain(
      "Disable-NetFirewallRule -InputObject $Rule",
    );
    expect(countPreviousFirewall).toContain(
      "Assert-FirewallRuleMatchesSnapshot",
    );
    expect(firewallRestore).toContain("Assert-FirewallRuleMatchesSnapshot");
    expect(firewallRestore).not.toContain("-ErrorAction SilentlyContinue");
    expect(firewallRestore).toContain(
      "Enable-NetFirewallRule -InputObject $Rule",
    );
    expect(firewallRestore).toContain(
      "Disable-NetFirewallRule -InputObject $Rule",
    );
    expect(adminKeyCleanup).toContain("[IO.File]::ReadAllBytes");
    expect(adminKeyCleanup).toContain("[IO.File]::WriteAllBytes");
    expect(adminKeyCleanup).toContain("Replace-FileAtomically");
    expect(adminKeyCleanup).not.toContain("[IO.File]::Replace");
    expect(adminKeyCleanup).not.toContain("Set-Content");
    expect(stateRollback).toContain("Register-Rollback");
    expect(stateRollback.indexOf("Register-Rollback")).toBeGreaterThan(
      stateRollback.indexOf("$RollbackErrors.Count -gt 0"),
    );
    expect(prepareStart).toBeGreaterThan(-1);
    expect(applyStart).toBeGreaterThan(-1);
    expect(verifyStart).toBeGreaterThan(applyStart);
    expect(rollbackStart).toBeGreaterThan(verifyStart);
    expect(prepare.indexOf("Register-Rollback")).toBeGreaterThan(-1);
    expect(prepare.indexOf("preparePending = $true")).toBeLessThan(
      prepare.indexOf("Save-State $State $StateDirectory"),
    );
    expect(prepare.indexOf("Save-State $State $StateDirectory")).toBeLessThan(
      prepare.indexOf("Register-Rollback"),
    );
    expect(prepare.indexOf("Enter-StateLock")).toBeGreaterThan(-1);
    expect(prepare).toContain("$StateLock.Dispose()");
    expect(
      prepare.indexOf("Assert-QaAccountLoggedOff $QaContext"),
    ).toBeGreaterThan(prepare.indexOf("$QaContext = Get-QaContext $QaUser"));
    expect(
      prepare.indexOf("Assert-QaAccountLoggedOff $QaContext"),
    ).toBeLessThan(prepare.indexOf("Initialize-StateRoot"));
    expect(
      prepare.lastIndexOf("Get-EnabledGenericSshCoveringRuleCount"),
    ).toBeGreaterThan(prepare.indexOf("Enter-StateLock"));
    expect(prepare.indexOf("Ensure-SshGroup")).toBeGreaterThan(
      prepare.indexOf("Register-Rollback"),
    );
    expect(apply.indexOf("Register-Rollback")).toBeGreaterThan(-1);
    expect(apply.indexOf("Disable-LocalUser")).toBeGreaterThan(
      apply.indexOf("Register-Rollback"),
    );
    expect(apply.lastIndexOf("Assert-QaAccountLoggedOff")).toBeGreaterThan(
      apply.indexOf("Disable-LocalUser"),
    );
    expect(apply.indexOf("Remove-LocalGroupMember")).toBeGreaterThan(
      apply.lastIndexOf("Assert-QaAccountLoggedOff"),
    );
    expect(apply.indexOf("Enable-LocalUser")).toBeGreaterThan(
      apply.indexOf("Remove-LocalGroupMember"),
    );
    expect(apply.indexOf("Enter-StateLock")).toBeLessThan(
      apply.indexOf("Load-State"),
    );
    expect(apply).toContain("$StateLock.Dispose()");
    expect(apply.indexOf("Remove-LocalGroupMember")).toBeGreaterThan(
      apply.indexOf("Register-Rollback"),
    );
    expect(apply.indexOf("membership changed after Prepare")).toBeGreaterThan(
      -1,
    );
    expect(apply.indexOf("membership changed after Prepare")).toBeLessThan(
      apply.indexOf("Register-Rollback"),
    );
    expect(apply.indexOf("Assert-ConfigUnchangedSincePrepare")).toBeLessThan(
      apply.indexOf("Register-Rollback"),
    );
    expect(apply.indexOf("$State.configModified = $true")).toBeLessThan(
      apply.indexOf("Install-SshdConfiguration"),
    );
    expect(apply.indexOf("$State.configModified = $true")).toBeGreaterThan(
      apply.lastIndexOf("Assert-ConfigUnchangedSincePrepare"),
    );
    expect(apply).toContain("already been applied");
    expect(apply).not.toContain("Disable-PreviousFirewallRules");
    expect(verify).toContain("Disable-PreviousFirewallRules");
    expect(verify).toContain("FinalizeFirewall cannot be combined with Commit");
    expect(verify).toContain("Get-EnabledBroadSshFirewallRuleCount");
    expect(harden).toContain("genericFirewallBlockerCount");
    expect(verify).toContain("The firewall has already been finalized");
    expect(verify).toContain("The hardening transaction is already committed");
    expect(verify.indexOf("Enter-StateLock")).toBeLessThan(
      verify.indexOf("Load-State"),
    );
    expect(verify).toContain("$StateLock.Dispose()");
    expect(rollback.indexOf("Enter-StateLock")).toBeLessThan(
      rollback.indexOf("Load-State"),
    );
    expect(rollback).toContain("scheduledRollbackSkipped");
    expect(rollback).toContain(
      "$LockTimeoutSeconds = if ($FromScheduledTask) { 0 } else { 30 }",
    );
    expect(rollback).toContain(
      "if ([bool] $State.committed -or -not $TransactionActive)",
    );
    expect(rollback).toContain("[bool] $State.preparePending");
    expect(rollback).toContain("$StateLock.Dispose()");
    expect(docs).toContain("Keep that console open");
    expect(docs).toContain("Before `Prepare`, fully sign out the QA account");
    expect(docs).toContain("protected hardening state directory");
    expect(docs).toContain("Keep the QA account signed out");
    expect(docs).toMatch(
      /Do not finalize\s+the firewall until that connection\s+succeeds\./,
    );
    expect(docs).toContain("never disables unrelated application rules");
  });

  it("rejects blank Windows firewall remote addresses", () => {
    const harden = read("scripts/windows-qa/harden-openssh.ps1");
    const assertion = harden.slice(
      harden.indexOf("function Assert-RemoteAddress"),
      harden.indexOf("function Test-ManagedFirewallRule"),
    );

    expect(assertion).toContain("[string]::IsNullOrWhiteSpace($Address)");

    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$start = $sourceText.IndexOf("function Test-RemoteAddressIsUniversal")
$end = $sourceText.IndexOf("function Test-ManagedFirewallRule")
if ($start -lt 0 -or $end -le $start) {
  throw "Firewall address assertion boundary was not found."
}
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

function Assert-AddressRejected {
  param([Parameter(Mandatory = $true)][string[]] $Addresses)

  $rejected = $false
  try {
    Assert-RemoteAddress -Addresses $Addresses
  } catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "An unsafe firewall address fixture was accepted."
  }
}

Assert-AddressRejected -Addresses @(" ")
Assert-AddressRejected -Addresses @([string] [char] 9)
Assert-AddressRejected -Addresses @("LocalSubnet", " ")
Assert-RemoteAddress -Addresses @("LocalSubnet")
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("fails closed when the managed Windows firewall lookup errors", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$lookupStart = $sourceText.IndexOf("function Get-ActiveFirewallRulesByName")
$lookupEnd = $sourceText.IndexOf("function Get-SshPortRules")
$start = $sourceText.IndexOf("function Restore-OriginalFirewallRules")
$end = $sourceText.IndexOf("function Restore-SshGroup")
if (
  $lookupStart -lt 0 -or
  $lookupEnd -le $lookupStart -or
  $start -lt 0 -or
  $end -le $start
) {
  throw "Firewall restore helper boundary was not found."
}
. ([scriptblock]::Create(
    $sourceText.Substring($lookupStart, $lookupEnd - $lookupStart)
  ))
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

$RestrictedFirewallRuleName = "fixture-managed-rule"
function Get-NetFirewallRule {
  [CmdletBinding()]
  param(
    [string] $Name,
    [string] $PolicyStore
  )

  Write-Error "Injected firewall provider failure."
  return @()
}

$state = [pscustomobject]@{
  restrictedFirewallRulePending = $true
  restrictedFirewallRuleCreated = $true
  restrictedRemoteAddresses = @("192.0.2.1")
  previousFirewallRulesModified = $false
  originalFirewallRules = @()
}
$restoreFailed = $false
try {
  Restore-OriginalFirewallRules $state
} catch {
  $restoreFailed = $true
}
if (-not $restoreFailed) {
  throw "A managed firewall provider failure was treated as no matching rule."
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("fails closed when Windows firewall inventory filters error", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$inventoryStart = $sourceText.IndexOf("function Get-SshPortRules")
$inventoryEnd = $sourceText.IndexOf("function Get-AutoDisableSshRules")
$snapshotStart = $sourceText.IndexOf("function ConvertTo-SortedFirewallStrings")
$snapshotEnd = $sourceText.IndexOf("function Test-FirewallRuleMatchesSnapshot")
if (
  $inventoryStart -lt 0 -or
  $inventoryEnd -le $inventoryStart -or
  $snapshotStart -lt 0 -or
  $snapshotEnd -le $snapshotStart
) {
  throw "Firewall inventory helper boundaries were not found."
}
. ([scriptblock]::Create(
  $sourceText.Substring(
    $inventoryStart,
    $inventoryEnd - $inventoryStart
  )
))
. ([scriptblock]::Create(
  $sourceText.Substring($snapshotStart, $snapshotEnd - $snapshotStart)
))

$script:FailFilter = ""
$script:FixturePortFilters = @()
$script:FixtureRules = @()
function Invoke-FixtureFilter {
  param([Parameter(Mandatory = $true)][string] $Name)

  if ($script:FailFilter -eq $Name) {
    Write-Error "Injected $Name firewall provider failure."
  }
  return @()
}
function Get-NetFirewallPortFilter {
  [CmdletBinding()]
  param(
    [Parameter(ValueFromPipeline = $true)] $InputObject,
    [string] $PolicyStore
  )
  process {
    Invoke-FixtureFilter "port" | Out-Null
    if ($null -eq $InputObject) {
      return @($script:FixturePortFilters)
    }
    return @()
  }
}
function Get-NetFirewallRule {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { return @($script:FixtureRules) }
}
function Get-NetFirewallServiceFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { Invoke-FixtureFilter "service" }
}
function Get-NetFirewallApplicationFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { Invoke-FixtureFilter "application" }
}
function Get-NetFirewallAddressFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { Invoke-FixtureFilter "address" }
}
function Get-NetFirewallInterfaceFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { Invoke-FixtureFilter "interface" }
}
function Get-NetFirewallInterfaceTypeFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { Invoke-FixtureFilter "interface-type" }
}
function Get-NetFirewallSecurityFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { Invoke-FixtureFilter "security" }
}

$rule = [pscustomobject]@{
  Name = "fixture-rule"
  InstanceID = "fixture-instance"
  PolicyStoreSource = "PersistentStore"
  PolicyStoreSourceType = "Local"
  Direction = "Inbound"
  Action = "Allow"
  Profile = "Private"
  EdgeTraversalPolicy = "Block"
  LooseSourceMapping = "False"
  LocalOnlyMapping = "False"
  Owner = ""
  PackageFamilyName = ""
  PolicyAppId = ""
  RemoteDynamicKeywordAddresses = @()
  Platform = @()
}

$script:FailFilter = "port"
$inventoryFailed = $false
try {
  Get-SshPortRules | Out-Null
} catch {
  $inventoryFailed = $true
}
if (-not $inventoryFailed) {
  throw "A port inventory failure was treated as an empty SSH rule set."
}

foreach ($filterName in @(
  "port",
  "service",
  "application",
  "address",
  "interface",
  "interface-type",
  "security"
)) {
  $script:FailFilter = $filterName
  $snapshotFailed = $false
  try {
    Get-FirewallRuleIdentitySnapshot $rule | Out-Null
  } catch {
    $snapshotFailed = $true
  }
  if (-not $snapshotFailed) {
    throw "A $filterName filter failure produced a firewall snapshot."
  }
}

$script:FailFilter = "service"
$classificationFailed = $false
try {
  Test-RuleTargetsSshd $rule | Out-Null
} catch {
  $classificationFailed = $true
}
if (-not $classificationFailed) {
  throw "A service-filter failure produced an SSH rule classification."
}

$script:FailFilter = ""
$script:FixturePortFilters = @([pscustomobject]@{
  Protocol = "TCP"
  LocalPort = @("22")
})
$sameNameRule = [pscustomobject]@{
  Name = "fixture-rule"
  InstanceID = "fixture-instance-2"
}
$script:FixtureRules = @($rule, $sameNameRule)
$sameNameInventory = @(Get-SshPortRules)
if ($sameNameInventory.Count -ne 2) {
  throw "Distinct same-name SSH firewall rules were deduplicated."
}

$script:FixtureRules = @([pscustomobject]@{
  Name = "missing-instance-rule"
  InstanceID = ""
})
$missingIdentityRejected = $false
try {
  Get-SshPortRules | Out-Null
} catch {
  $missingIdentityRejected = $true
}
if (-not $missingIdentityRejected) {
  throw "A firewall rule without an instance identity was accepted."
}

$script:FixtureRules = @(
  [pscustomobject]@{
    Name = "duplicate-instance-rule-a"
    InstanceID = "duplicate-instance"
  },
  [pscustomobject]@{
    Name = "duplicate-instance-rule-b"
    InstanceID = "duplicate-instance"
  }
)
$duplicateIdentityRejected = $false
try {
  Get-SshPortRules | Out-Null
} catch {
  $duplicateIdentityRejected = $true
}
if (-not $duplicateIdentityRejected) {
  throw "Duplicate firewall rule instance identities were accepted."
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("verifies the complete automatic rollback task registration", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$start = $sourceText.IndexOf("function ConvertFrom-ScheduledTaskDuration")
$end = $sourceText.IndexOf("function Register-Rollback")
if ($start -lt 0 -or $end -le $start) {
  throw "Rollback task verification helper boundaries were not found."
}
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

$SystemSidValue = "S-1-5-18"
$expectedExecutable = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
$expectedArguments = "-NoProfile -File fixture.ps1"
$expectedTriggerAt = (Get-Date).AddMinutes(15)

function New-FixtureRollbackTask {
  return [pscustomobject]@{
    Actions = @([pscustomobject]@{
      Execute = $expectedExecutable
      Arguments = $expectedArguments
    })
    Principal = [pscustomobject]@{
      UserId = "SYSTEM"
      LogonType = "ServiceAccount"
      RunLevel = "Highest"
    }
    Settings = [pscustomobject]@{
      Enabled = $true
      StartWhenAvailable = $true
      DisallowStartIfOnBatteries = $false
      StopIfGoingOnBatteries = $false
      ExecutionTimeLimit = New-TimeSpan -Minutes 5
      RestartCount = 3
      RestartInterval = New-TimeSpan -Minutes 1
    }
    Triggers = @([pscustomobject]@{
      Enabled = $true
      StartBoundary = $expectedTriggerAt.ToString("o")
      CimClass = [pscustomobject]@{
        CimClassName = "MSFT_TaskTimeTrigger"
      }
    })
  }
}

$script:FixtureTask = New-FixtureRollbackTask
function Get-ScheduledTask {
  [CmdletBinding()]
  param([string] $TaskName)

  return @($script:FixtureTask)
}

function Assert-FixtureTaskRejected {
  param([Parameter(Mandatory = $true)][string] $Description)

  $rejected = $false
  try {
    Assert-RollbackTaskRegistered \`
      -TaskName "fixture-task" \`
      -ExpectedExecutable $expectedExecutable \`
      -ExpectedArguments $expectedArguments \`
      -ExpectedTriggerAt $expectedTriggerAt
  } catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "$Description was accepted."
  }
}

Assert-RollbackTaskRegistered \`
  -TaskName "fixture-task" \`
  -ExpectedExecutable $expectedExecutable \`
  -ExpectedArguments $expectedArguments \`
  -ExpectedTriggerAt $expectedTriggerAt

$script:FixtureTask = New-FixtureRollbackTask
$script:FixtureTask.Settings.Enabled = $false
Assert-FixtureTaskRejected "A disabled rollback task"

$script:FixtureTask = New-FixtureRollbackTask
$script:FixtureTask.Triggers = @()
Assert-FixtureTaskRejected "A rollback task without a trigger"

$script:FixtureTask = New-FixtureRollbackTask
$script:FixtureTask.Triggers = @(
  $script:FixtureTask.Triggers[0],
  $script:FixtureTask.Triggers[0]
)
Assert-FixtureTaskRejected "A rollback task with multiple triggers"

$script:FixtureTask = New-FixtureRollbackTask
$script:FixtureTask.Triggers[0].Enabled = $false
Assert-FixtureTaskRejected "A rollback task with a disabled trigger"

$script:FixtureTask = New-FixtureRollbackTask
$script:FixtureTask.Triggers[0].CimClass.CimClassName = "MSFT_TaskBootTrigger"
Assert-FixtureTaskRejected "A rollback task with a non-time trigger"

$script:FixtureTask = New-FixtureRollbackTask
$script:FixtureTask.Triggers[0].StartBoundary = (
  $expectedTriggerAt.AddMinutes(1).ToString("o")
)
Assert-FixtureTaskRejected "A rollback task with a changed start time"
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("fails closed when Windows account state cannot be verified", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$lookupStart = $sourceText.IndexOf("function Get-LocalGroupByName")
$lookupEnd = $sourceText.IndexOf("function Get-AdministratorsGroup")
$membershipStart = $sourceText.IndexOf("function Test-GroupContainsSid")
$membershipEnd = $sourceText.IndexOf("function Test-QaIsAdministrator")
$loggedOffStart = $sourceText.IndexOf("function Assert-QaAccountLoggedOff")
$loggedOffEnd = $sourceText.IndexOf("function Assert-SshGroupName")
if (
  $lookupStart -lt 0 -or
  $lookupEnd -le $lookupStart -or
  $membershipStart -lt 0 -or
  $membershipEnd -le $membershipStart -or
  $loggedOffStart -lt 0 -or
  $loggedOffEnd -le $loggedOffStart
) {
  throw "Account-state helper boundaries were not found."
}
. ([scriptblock]::Create(
    $sourceText.Substring($lookupStart, $lookupEnd - $lookupStart)
  ))
. ([scriptblock]::Create(
    $sourceText.Substring(
      $membershipStart,
      $membershipEnd - $membershipStart
    )
  ))
. ([scriptblock]::Create(
    $sourceText.Substring($loggedOffStart, $loggedOffEnd - $loggedOffStart)
  ))

$script:FailGroupInventory = $false
function Get-LocalGroup {
  [CmdletBinding()]
  param()

  if ($script:FailGroupInventory) {
    Write-Error "Injected local-group provider failure."
  }
  return @([pscustomobject]@{ Name = "fixture-group" })
}
function Get-LocalGroupMember {
  [CmdletBinding()]
  param([string] $Group)

  Write-Error "Injected group-member provider failure."
}

$script:FailGroupInventory = $true
$lookupFailed = $false
try {
  Get-LocalGroupByName "fixture-group"
} catch {
  $lookupFailed = $true
}
if (-not $lookupFailed) {
  throw "A local-group provider failure was treated as an absent group."
}

$membershipFailed = $false
try {
  Test-GroupContainsSid "fixture-group" "S-1-5-21-fixture"
} catch {
  $membershipFailed = $true
}
if (-not $membershipFailed) {
  throw "A group-member provider failure was treated as non-membership."
}

$script:Processes = @([pscustomobject]@{ ProcessId = 1 })
$script:Sessions = @([pscustomobject]@{
  LogonId = 2
  LogonType = 2
})
$script:Accounts = @([pscustomobject]@{
  SID = "S-1-5-21-111-222-333-2001"
})
$script:FailSessionAssociation = $false
$script:OwnerResult = [pscustomobject]@{
  ReturnValue = 2
  Sid = $null
}
function Get-CimInstance {
  [CmdletBinding()]
  param([string] $ClassName)

  if ($ClassName -eq "Win32_Process") {
    return @($script:Processes)
  }
  if ($ClassName -eq "Win32_LogonSession") {
    return @($script:Sessions)
  }
  throw "Unexpected CIM class."
}
function Get-CimAssociatedInstance {
  [CmdletBinding()]
  param(
    $InputObject,
    [string] $Association,
    [string] $ResultClassName
  )

  if ($script:FailSessionAssociation) {
    Write-Error "Injected session association failure."
  }
  return @($script:Accounts)
}
function Invoke-CimMethod {
  [CmdletBinding()]
  param(
    $InputObject,
    [string] $MethodName
  )

  return $script:OwnerResult
}

function Assert-LoggedOffCheckFails {
  $loggedOffFailed = $false
  try {
    Assert-QaAccountLoggedOff ([pscustomobject]@{
        SidValue = "S-1-5-21-111-222-333-1001"
      })
  } catch {
    $loggedOffFailed = $true
  }
  if (-not $loggedOffFailed) {
    throw "Unverifiable process ownership was treated as proof of logout."
  }
}

Assert-LoggedOffCheckFails
$script:OwnerResult = [pscustomobject]@{
  ReturnValue = 0
  Sid = $null
}
Assert-LoggedOffCheckFails
$script:OwnerResult = [pscustomobject]@{
  ReturnValue = 0
  Sid = "not-a-sid"
}
Assert-LoggedOffCheckFails
$script:Processes = @()
Assert-LoggedOffCheckFails
$script:Processes = @([pscustomobject]@{ ProcessId = 1 })
$script:OwnerResult = [pscustomobject]@{
  ReturnValue = 0
  Sid = "S-1-5-21-111-222-333-2001"
}
$script:Accounts = @([pscustomobject]@{
  SID = "S-1-5-21-111-222-333-1001"
})
Assert-LoggedOffCheckFails
$script:Accounts = @()
Assert-LoggedOffCheckFails
$script:Accounts = @([pscustomobject]@{
  SID = "S-1-5-21-111-222-333-2001"
})
$script:FailSessionAssociation = $true
Assert-LoggedOffCheckFails
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects untrusted preexisting OpenSSH hardening state roots", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$pathStart = $sourceText.IndexOf("function New-Sid")
$pathEnd = $sourceText.IndexOf("function Get-SshdExecutable")
if (
  $pathStart -lt 0 -or
  $pathEnd -le $pathStart
) {
  throw "Protected-state helper boundaries were not found."
}
. ([scriptblock]::Create(
  $sourceText.Substring($pathStart, $pathEnd - $pathStart)
))

$root = Join-Path ([IO.Path]::GetTempPath()) (
  "ytme-state-root-" + [guid]::NewGuid().ToString("N")
)
$outsideRoot = "$root-outside"
$SystemSid = New-Sid "S-1-5-18"
$AdministratorsSid = New-Sid "S-1-5-32-544"
$SystemSidValue = $SystemSid.Value
$AdministratorsSidValue = $AdministratorsSid.Value
$StateRootMarkerName = ".ytme-openssh-hardening-root"
try {
  New-Item -ItemType Directory -Path $root | Out-Null
  [IO.File]::WriteAllText(
    (Join-Path $root $StateRootMarkerName),
    "untrusted"
  )
  [IO.File]::WriteAllText(
    (Join-Path $root "current-state.txt"),
    "precreated"
  )

  $untrustedRootRejected = $false
  try {
    Initialize-StateRoot
  } catch {
    $untrustedRootRejected = $true
  }
  if (-not $untrustedRootRejected) {
    throw "A preexisting unprotected state tree was accepted."
  }

  Remove-Item -LiteralPath $root -Recurse -Force
  New-Item -ItemType Directory -Force -Path $outsideRoot | Out-Null
  New-Item -ItemType Junction -Path $root -Target $outsideRoot |
    Out-Null

  $reparseRejected = $false
  try {
    Initialize-StateRoot
  } catch {
    $reparseRejected = $true
  }
  if (-not $reparseRejected) {
    throw "A junction-backed state root was accepted."
  }
} finally {
  if (Test-Path -LiteralPath $root) {
    $rootItem = Get-Item -LiteralPath $root -Force
    if (
      ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      [IO.Directory]::Delete($root, $false)
    }
  }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $outsideRoot -Recurse -Force -ErrorAction SilentlyContinue
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("detects same-identity Windows firewall constraint drift", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$start = $sourceText.IndexOf("function ConvertTo-SortedFirewallStrings")
$end = $sourceText.IndexOf("function Get-RuleRemoteAddresses")
if ($start -lt 0 -or $end -le $start) {
  throw "Firewall snapshot helper boundary was not found."
}
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

$script:portFilter = [pscustomobject]@{
  InstanceID = "port-filter"
  Protocol = "TCP"
  LocalPort = @("22")
  RemotePort = @("Any")
  IcmpType = @("Any")
  DynamicTarget = "Any"
}
$script:serviceFilter = [pscustomobject]@{
  InstanceID = "service-filter"
  Service = "sshd"
}
$script:applicationFilter = [pscustomobject]@{
  InstanceID = "application-filter"
  Program = "C:\\Windows\\System32\\OpenSSH\\sshd.exe"
  AppPath = "C:\\Windows\\System32\\OpenSSH\\sshd.exe"
  Package = ""
}
$script:addressFilter = [pscustomobject]@{
  InstanceID = "address-filter"
  LocalAddress = @("Any")
  RemoteAddress = @("LocalSubnet")
}
$script:interfaceFilter = [pscustomobject]@{
  InstanceID = "interface-filter"
  InterfaceAlias = @("Ethernet 1")
}
$script:interfaceTypeFilter = [pscustomobject]@{
  InstanceID = "interface-type-filter"
  InterfaceType = @("Wired")
}
$script:securityFilter = [pscustomobject]@{
  InstanceID = "security-filter"
  Authentication = "NotRequired"
  Encryption = "NotRequired"
  OverrideBlockRules = "False"
  LocalUser = ""
  RemoteUser = ""
  RemoteMachine = ""
}

function Get-NetFirewallPortFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { $script:portFilter }
}
function Get-NetFirewallServiceFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { $script:serviceFilter }
}
function Get-NetFirewallApplicationFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { $script:applicationFilter }
}
function Get-NetFirewallAddressFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { $script:addressFilter }
}
function Get-NetFirewallInterfaceFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { $script:interfaceFilter }
}
function Get-NetFirewallInterfaceTypeFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { $script:interfaceTypeFilter }
}
function Get-NetFirewallSecurityFilter {
  [CmdletBinding()]
  param([Parameter(ValueFromPipeline = $true)] $InputObject)
  process { $script:securityFilter }
}

$rule = [pscustomobject]@{
  Name = "fixture-rule"
  InstanceID = "rule-instance"
  Enabled = "True"
  PolicyStoreSource = "PersistentStore"
  PolicyStoreSourceType = "Local"
  Direction = "Inbound"
  Action = "Allow"
  Profile = "Private"
  EdgeTraversalPolicy = "Block"
  LooseSourceMapping = "False"
  LocalOnlyMapping = "False"
  Owner = ""
  PackageFamilyName = ""
  PolicyAppId = ""
  RemoteDynamicKeywordAddresses = @("keyword-1")
  Platform = @("10.0+")
}
$snapshot = Get-FirewallRuleIdentitySnapshot $rule
if (-not (
    Test-FirewallRuleMatchesSnapshot $rule $snapshot @("True")
  )) {
  throw "Unchanged firewall rule did not match its snapshot."
}

$script:interfaceFilter.InterfaceAlias = @("Wi-Fi")
if (Test-FirewallRuleMatchesSnapshot $rule $snapshot @("True")) {
  throw "Interface-filter drift was not detected."
}
$script:interfaceFilter.InterfaceAlias = @("Ethernet 1")

$script:securityFilter.RemoteUser = "S-1-5-21-fixture"
if (Test-FirewallRuleMatchesSnapshot $rule $snapshot @("True")) {
  throw "Security-filter drift was not detected."
}
$script:securityFilter.RemoteUser = ""

$rule.RemoteDynamicKeywordAddresses = @("keyword-2")
if (Test-FirewallRuleMatchesSnapshot $rule $snapshot @("True")) {
  throw "Dynamic-address drift was not detected."
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("restores only Windows firewall rules changed by the transaction", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$lookupStart = $sourceText.IndexOf("function Get-ActiveFirewallRulesByName")
$lookupEnd = $sourceText.IndexOf("function Get-SshPortRules")
$start = $sourceText.IndexOf("function Restore-OriginalFirewallRules")
$end = $sourceText.IndexOf("function Restore-SshGroup")
if (
  $lookupStart -lt 0 -or
  $lookupEnd -le $lookupStart -or
  $start -lt 0 -or
  $end -le $start
) {
  throw "Firewall restore helper boundary was not found."
}
. ([scriptblock]::Create(
    $sourceText.Substring($lookupStart, $lookupEnd - $lookupStart)
  ))
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

$script:rule = [pscustomobject]@{ Enabled = "False" }
$script:enableCalls = 0
$script:disableCalls = 0
$script:validatedManagedRule = [pscustomobject]@{
  Name = "managed-rule"
  InstanceID = "validated-managed-instance"
}
$script:removedManagedRule = $null
$RestrictedFirewallRuleName = "managed-rule"
function Assert-FirewallRuleMatchesSnapshot {
  param($RuleState, [string[]] $AllowedEnabled)
  return $script:rule
}
function Enable-NetFirewallRule {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] $InputObject)
  $script:enableCalls += 1
  $InputObject.Enabled = "True"
}
function Disable-NetFirewallRule {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)] $InputObject)
  $script:disableCalls += 1
  $InputObject.Enabled = "False"
}
function Get-NetFirewallRule {
  [CmdletBinding()]
  param(
    [string] $Name,
    [string] $PolicyStore
  )
  return $script:validatedManagedRule
}
function Test-ManagedFirewallRule {
  param($Rule, [string[]] $ExpectedAddresses)
  return $true
}
function Remove-NetFirewallRule {
  [CmdletBinding()]
  param($InputObject, [string] $Name)
  $script:removedManagedRule = $InputObject
}

$restrictedState = [pscustomobject]@{
  restrictedFirewallRulePending = $false
  restrictedFirewallRuleCreated = $true
  restrictedRemoteAddresses = @("LocalSubnet")
  previousFirewallRulesModified = $false
  originalFirewallRules = @()
}
Restore-OriginalFirewallRules $restrictedState
if (
  $null -eq $script:removedManagedRule -or
  $script:removedManagedRule.InstanceID -ne "validated-managed-instance"
) {
  throw "Rollback did not remove the validated managed firewall instance."
}

$disabledState = [pscustomobject]@{
  restrictedFirewallRulePending = $false
  restrictedFirewallRuleCreated = $false
  previousFirewallRulesModified = $true
  originalFirewallRules = @(
    [pscustomobject]@{
      name = "disabled-rule"
      enabled = "False"
      identitySnapshot = [pscustomobject]@{}
    }
  )
}
Restore-OriginalFirewallRules $disabledState
if ($script:enableCalls -ne 0 -or $script:disableCalls -ne 0) {
  throw "Rollback mutated a firewall rule already in its original state."
}

$script:rule.Enabled = "False"
$enabledState = [pscustomobject]@{
  restrictedFirewallRulePending = $false
  restrictedFirewallRuleCreated = $false
  previousFirewallRulesModified = $true
  originalFirewallRules = @(
    [pscustomobject]@{
      name = "enabled-rule"
      enabled = "True"
      identitySnapshot = [pscustomobject]@{}
    }
  )
}
Restore-OriginalFirewallRules $enabledState
if (
  $script:enableCalls -ne 1 -or
  $script:disableCalls -ne 0 -or
  [string] $script:rule.Enabled -ne "True"
) {
  throw "Rollback did not restore the changed firewall rule exactly once."
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("keeps the live sshd config intact when rollback staging fails", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$pathStart = $sourceText.IndexOf("function Assert-PathHasNoReparsePoint")
$pathEnd = $sourceText.IndexOf("function Set-AdministrativeDirectoryAcl")
$start = $sourceText.IndexOf("function Restore-SshdConfiguration")
$end = $sourceText.IndexOf("function Invoke-StateRollback")
if (
  $pathStart -lt 0 -or
  $pathEnd -le $pathStart -or
  $start -lt 0 -or
  $end -le $start
) {
  throw "Configuration restore helper boundary was not found."
}
. ([scriptblock]::Create(
    $sourceText.Substring($pathStart, $pathEnd - $pathStart)
  ))
. ([scriptblock]::Create($sourceText.Substring($start, $end - $start)))

$root = Join-Path ([IO.Path]::GetTempPath()) (
  "ytme-config-rollback-" + [guid]::NewGuid().ToString("N")
)
New-Item -ItemType Directory -Force -Path $root | Out-Null
$ConfigPath = Join-Path $root "sshd_config"
$backupPath = Join-Path $root "sshd_config.original"
$hardenedContent = "complete hardened config"
$originalContent = "complete original config"
try {
  [IO.File]::WriteAllText($ConfigPath, $hardenedContent)
  [IO.File]::WriteAllText($backupPath, $originalContent)
  $state = [pscustomobject]@{
    configModified = $true
    configBackupPath = $backupPath
    configSddl = "fixture-sddl"
    configSha256 = (Get-YtmeFileSha256 -Path $backupPath)
  }
  function Set-FileAclFromSddl {
    throw "Injected staging failure."
  }

  $restoreFailed = $false
  try {
    Restore-SshdConfiguration $state
  } catch {
    $restoreFailed = $true
  }
  if (-not $restoreFailed) {
    throw "Injected rollback staging failure was not surfaced."
  }
  if ([IO.File]::ReadAllText($ConfigPath) -ne $hardenedContent) {
    throw "Live sshd configuration changed before atomic replacement."
  }
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("restores exact administrator key restrictions during rollback", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$pathStart = $sourceText.IndexOf("function Assert-PathHasNoReparsePoint")
$pathEnd = $sourceText.IndexOf("function Set-AdministrativeDirectoryAcl")
$atomicStart = $sourceText.IndexOf("function Replace-FileAtomically")
$atomicEnd = $sourceText.IndexOf("function Save-State")
$keyStart = $sourceText.IndexOf("function Split-AuthorizedKeyLine")
$keyEnd = $sourceText.IndexOf("function Restore-AdministratorMembership")
if (
  $pathStart -lt 0 -or
  $pathEnd -le $pathStart -or
  $atomicStart -lt 0 -or
  $atomicEnd -le $atomicStart -or
  $keyStart -lt 0 -or
  $keyEnd -le $keyStart
) {
  throw "Administrator authorized-key helper boundaries were not found."
}
. ([scriptblock]::Create(
  $sourceText.Substring($pathStart, $pathEnd - $pathStart)
))
. ([scriptblock]::Create(
  $sourceText.Substring($atomicStart, $atomicEnd - $atomicStart)
))
. ([scriptblock]::Create(
  $sourceText.Substring($keyStart, $keyEnd - $keyStart)
))

function Set-FileAclFromSddl {}
function Assert-AdministrativePathAcl {}

$root = Join-Path ([IO.Path]::GetTempPath()) (
  "ytme-administrator-key-rollback-" + [guid]::NewGuid().ToString("N")
)
$stateDirectory = Join-Path $root "state"
$protectedKeyPath = Join-Path $stateDirectory "authorized_keys"
$backupPath = Join-Path $stateDirectory "administrators_authorized_keys.original"
$administratorKeyPath = Join-Path $root "administrators_authorized_keys"
$canonicalKey = (
  "ssh-ed25519 " +
  "AAAAC3NzaC1lZDI1NTE5AAAAIFixtureAdministratorKey"
)
$restrictedLine = (
  'from="192.0.2.0/24",restrict ' +
  $canonicalKey +
  " original-restricted-key"
)
$unrelatedLine = (
  "ssh-ed25519 " +
  "AAAAC3NzaC1lZDI1NTE5AAAAIUnrelatedAdministratorKey unrelated"
)
try {
  New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
  [IO.File]::WriteAllText(
    $protectedKeyPath,
    "$canonicalKey\`r\`n",
    [Text.Encoding]::ASCII
  )
  [IO.File]::WriteAllText(
    $backupPath,
    "$restrictedLine\`r\`n$unrelatedLine\`r\`n",
    [Text.Encoding]::ASCII
  )
  [IO.File]::WriteAllText(
    $administratorKeyPath,
    "$unrelatedLine\`r\`n",
    [Text.Encoding]::ASCII
  )
  $state = [pscustomobject]@{
    administratorKeyModified = $true
    administratorKeyExisted = $true
    administratorKeyContainedQaKey = $true
    administratorKeyPath = $administratorKeyPath
    administratorKeyBackupPath = $backupPath
    administratorKeyBackupSha256 = (
      Get-YtmeFileSha256 -Path $backupPath
    )
    administratorKeySddl = (Get-Acl -LiteralPath $administratorKeyPath).Sddl
    protectedAuthorizedKeysPath = $protectedKeyPath
  }

  Restore-AdministratorAuthorizedKeys $state $stateDirectory

  $restoredLines = @(
    Get-Content -LiteralPath $administratorKeyPath -ErrorAction Stop
  )
  if ($restoredLines -notcontains $restrictedLine) {
    throw "Rollback did not restore the original restricted key line."
  }
  if ($restoredLines -contains $canonicalKey) {
    throw "Rollback widened the original restricted key line."
  }
  if ($restoredLines -notcontains $unrelatedLine) {
    throw "Rollback removed an unrelated administrator key."
  }
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("atomically updates state and sshd configuration on PowerShell 5.1", () => {
    if (process.platform !== "win32") {
      return;
    }

    const hardenPath = resolve(
      process.cwd(),
      "scripts/windows-qa/harden-openssh.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourceText = [IO.File]::ReadAllText('${hardenPath}')
$pathStart = $sourceText.IndexOf("function Assert-PathHasNoReparsePoint")
$pathEnd = $sourceText.IndexOf("function Set-AdministrativeDirectoryAcl")
$atomicStart = $sourceText.IndexOf("function Replace-FileAtomically")
$stateEnd = $sourceText.IndexOf("function Resolve-StateDirectory")
$installStart = $sourceText.IndexOf("function Install-SshdConfiguration")
$installEnd = $sourceText.IndexOf("function Restore-SshdConfiguration")
$restoreEnd = $sourceText.IndexOf("function Invoke-StateRollback")
if (
  $pathStart -lt 0 -or
  $pathEnd -le $pathStart -or
  $atomicStart -lt 0 -or
  $stateEnd -le $atomicStart -or
  $installStart -lt 0 -or
  $installEnd -le $installStart -or
  $restoreEnd -le $installEnd
) {
  throw "Atomic file helper boundaries were not found."
}
. ([scriptblock]::Create(
  $sourceText.Substring($pathStart, $pathEnd - $pathStart)
))
. ([scriptblock]::Create(
  $sourceText.Substring($atomicStart, $stateEnd - $atomicStart)
))
. ([scriptblock]::Create(
  $sourceText.Substring($installStart, $restoreEnd - $installStart)
))

$root = Join-Path ([IO.Path]::GetTempPath()) (
  "ytme-atomic-files-" + [guid]::NewGuid().ToString("N")
)
$StateRoot = Join-Path $root "state-root"
$stateDirectory = Join-Path $StateRoot "fixture-state"
$ConfigPath = Join-Path $root "sshd_config"
$candidatePath = Join-Path $root "sshd_config.candidate"
$backupPath = Join-Path $root "sshd_config.original"
try {
  New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
  Save-State ([pscustomobject]@{ value = "first" }) $stateDirectory
  Save-State ([pscustomobject]@{ value = "second" }) $stateDirectory
  $savedState = (
    [IO.File]::ReadAllText((Join-Path $stateDirectory "state.json")) |
      ConvertFrom-Json
  )
  if ($savedState.value -ne "second") {
    throw "The second atomic state write was not persisted."
  }
  $statePath = Join-Path $stateDirectory "state.json"
  $stateLock = [IO.File]::Open(
    $statePath,
    [IO.FileMode]::Open,
    [IO.FileAccess]::ReadWrite,
    [IO.FileShare]::None
  )
  try {
    $lockedWriteFailed = $false
    try {
      Save-State ([pscustomobject]@{ value = "third" }) $stateDirectory
    } catch {
      $lockedWriteFailed = $true
    }
    if (-not $lockedWriteFailed) {
      throw "An exclusively locked state file was replaced."
    }
  } finally {
    $stateLock.Dispose()
  }
  $savedState = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
  if ($savedState.value -ne "second") {
    throw "A failed atomic state write changed the destination."
  }
  Set-CurrentStateId "first"
  Set-CurrentStateId "second"
  if (
    [IO.File]::ReadAllText(
      (Join-Path $StateRoot "current-state.txt")
    ).Trim() -ne "second"
  ) {
    throw "The second atomic current-state write was not persisted."
  }

  [IO.File]::WriteAllText($ConfigPath, "complete original config")
  [IO.File]::WriteAllText($candidatePath, "complete candidate config")
  [IO.File]::WriteAllText($backupPath, "complete original config")
  $state = [pscustomobject]@{
    configModified = $true
    configBackupPath = $backupPath
    configSddl = "fixture-sddl"
    configSha256 = (Get-YtmeFileSha256 -Path $backupPath)
  }
  function Assert-ConfigUnchangedSincePrepare {}
  function Set-FileAclFromSddl {}

  function Set-FileAclFromSddl {
    throw "Injected activation staging failure."
  }
  $activationFailed = $false
  try {
    Install-SshdConfiguration -CandidatePath $candidatePath -State $state
  } catch {
    $activationFailed = $true
  }
  if (-not $activationFailed) {
    throw "Injected activation staging failure was not surfaced."
  }
  if ([IO.File]::ReadAllText($ConfigPath) -ne "complete original config") {
    throw "Activation changed the live config before atomic replacement."
  }

  function Set-FileAclFromSddl {}
  Install-SshdConfiguration -CandidatePath $candidatePath -State $state
  if ([IO.File]::ReadAllText($ConfigPath) -ne "complete candidate config") {
    throw "Atomic activation did not install the complete candidate config."
  }

  Remove-Item -LiteralPath $ConfigPath -Force
  $missingActivationFailed = $false
  try {
    Install-SshdConfiguration -CandidatePath $candidatePath -State $state
  } catch {
    $missingActivationFailed = $true
  }
  if (-not $missingActivationFailed) {
    throw "Activation accepted a missing live sshd configuration."
  }
  if (Test-Path -LiteralPath $ConfigPath) {
    throw "Failed activation recreated a missing live configuration."
  }

  Restore-SshdConfiguration $state
  if ([IO.File]::ReadAllText($ConfigPath) -ne "complete original config") {
    throw "Atomic rollback did not restore the complete original config."
  }
  if (
    @(
      Get-ChildItem -LiteralPath $root -Filter "*.ytme-replace-backup-*" -Recurse -Force
    ).Count -ne 0
  ) {
    throw "Atomic replacement left a temporary backup behind."
  }
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, result.stderr).toBe(0);
  });

  it("runs Windows QA directly or through a macOS intermediary", () => {
    const runner = read("scripts/remote/windows-qa/run.sh");
    const crabboxRunner = read("scripts/remote/windows-qa/crabbox-run.sh");
    const syncSource = read("scripts/windows-qa/sync-source.ps1");
    const gitignore = read(".gitignore");
    const cleanupAll = runner.slice(
      runner.indexOf("cleanup_all()"),
      runner.indexOf("trap cleanup_all"),
    );
    const remoteCleanup = runner.slice(
      runner.indexOf("cleanup_script="),
      runner.indexOf('setup_command="$(ps_encoded "$setup_script")"'),
    );
    const removeTree = syncSource.slice(
      syncSource.indexOf("function Remove-QaTree"),
      syncSource.indexOf("function Test-PrivateQaResidueRelativePath"),
    );

    expect(runner).toContain(
      'macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"',
    );
    expect(runner).toContain(
      'transport="${REMOTE_QA_WINDOWS_TRANSPORT:-direct}"',
    );
    expect(runner).toContain("run_direct");
    expect(runner).toContain("run_macos_intermediary");
    expect(runner).toContain("--preserve-apps");
    expect(runner).toContain('preserve_apps="true"');
    expect(runner).toContain("$PreserveApps");
    expect(runner).toContain("--adopt-work-root");
    expect(runner).toContain("Adoption requires --preserve-apps");
    expect(runner).toContain("REMOTE_QA_CONFIG=/dev/null");
    expect(runner).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(runner).toContain("REMOTE_QA_WINDOWS_PNPM_NODE_LINKER");
    expect(runner).toContain("PNPM_CONFIG_NODE_LINKER");
    expect(runner).toContain("PNPM_CONFIG_PACKAGE_IMPORT_METHOD");
    expect(runner).toContain("--allow-env REMOTE_QA_WINDOWS_HOST");
    expect(runner).toContain("--allow-env REMOTE_QA_WINDOWS_USER");
    expect(runner).toContain("--allow-env REMOTE_QA_WINDOWS_SSH_KEY");
    expect(runner).not.toContain(
      'REMOTE_QA_WINDOWS_HOST=\'"$(quote "$windows_host")"\'',
    );
    expect(runner).toContain("powershell.exe");
    expect(runner).toContain("-EncodedCommand");
    expect(runner).toContain("scripts/windows-qa/sync-source.ps1");
    expect(runner).toContain("sync_script_file");
    expect(runner).toContain("sftp_windows() {");
    expect(runner).toContain("sftp");
    expect(runner).toContain('sftp_batch_file=""');
    expect(runner).toContain("assert_sftp_batch_path");
    expect(runner).toContain('sftp_windows "$sftp_batch_file"');
    expect(runner).toContain('-b "$batch_file"');
    expect(runner).toContain("put ");
    expect(runner).toContain("run_script_file");
    expect(runner).toContain(".ytm-enhancer-remote-qa");
    expect(runner).toContain("helper-\\$id.ps1.tmp");
    expect(runner).toContain("archive-\\$id.tar.gz.tmp");
    expect(runner).toContain("command-\\$id.ps1.tmp");
    expect(runner).toContain("Assert-TransportFile");
    expect(runner).toContain("[Security.Cryptography.SHA256]::Create()");
    expect(runner).not.toContain("Get-FileHash");
    expect(runner).toContain("run_script_sha256");
    expect(syncSource).toContain("function Get-YtmeFileSha256");
    expect(syncSource).not.toContain("Get-FileHash");
    expect(runner).toContain("assert_short_encoded_command");
    expect(runner).toContain('if [ "${#1}" -gt 6500 ]; then');
    expect(runner).toContain("cleanup_ssh_diagnostics");
    expect(runner).toContain("cleanup_remote_transport");
    expect(runner).toContain("remote_cleanup_armed");
    expect(cleanupAll.indexOf("cleanup_private_files")).toBeLessThan(
      cleanupAll.indexOf("cleanup_remote_transport"),
    );
    expect(runner).toContain("-o ConnectTimeout=10");
    expect(runner).toContain("-o ServerAliveInterval=2");
    expect(runner).toContain("-o ServerAliveCountMax=2");
    expect(runner).toContain("-o StrictHostKeyChecking=yes");
    expect(runner).toContain("-o IdentitiesOnly=yes");
    expect(runner).toContain("-oConnectTimeout=10");
    expect(runner).toContain("-oServerAliveInterval=2");
    expect(runner).toContain("-oServerAliveCountMax=2");
    expect(runner).toContain("-oStrictHostKeyChecking=yes");
    expect(runner).toContain("-oIdentitiesOnly=yes");
    expect(remoteCleanup).toContain("$rootItem.PSIsContainer");
    expect(remoteCleanup).toContain("[IO.FileAttributes]::ReparsePoint");
    expect(runner).toContain("function Remove-ExactTransportFiles");
    expect(
      (runner.match(/Remove-ExactTransportFiles/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(runner).toContain("LastWriteTimeUtc");
    expect(runner).toContain("AddHours(-1)");
    expect(runner).not.toContain("} | sftp_windows");
    expect(runner).not.toContain("OpenStandardInput");
    expect(runner).not.toContain("CopyTo");
    expect(runner).not.toContain("-Command -");
    expect(runner).not.toContain("$(sed -n '1,$p' \"$sync_helper_file\")");
    expect(syncSource).toContain("function Remove-QaTree");
    expect(syncSource).toContain(
      "Get-Process chrome, msedge, firefox, YTMTray",
    );
    expect(syncSource).toContain("[IO.Directory]::Delete");
    expect(syncSource).toContain("function Remove-QaTreeNoFollow");
    expect(syncSource).toContain("function Remove-StaleQaStagingDirectories");
    expect(syncSource).toContain("function Remove-StaleQaMergeArtifacts");
    expect(syncSource).toContain(".ytme-sync-backup-");
    expect(syncSource).toContain("LastWriteTimeUtc");
    expect(syncSource).toContain("AddHours(-1)");
    expect(removeTree).toContain("Get-ChildItem");
    expect(removeTree).toContain("-LiteralPath $DirectoryPath");
    expect(removeTree).toContain("-ErrorAction Stop");
    expect(removeTree).not.toContain(
      "Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue",
    );
    expect(runner).toContain("sync_operation");
    expect(runner).toContain("sync_revision");
    expect(runner).toContain(
      `jj --color=never --quiet log -r @ --no-graph -T ''`,
    );
    expect(runner).toContain(
      `jj --at-operation=@ --ignore-working-copy --color=never --quiet`,
    );
    expect(
      runner.indexOf(`jj --color=never --quiet log -r @ --no-graph -T ''`),
    ).toBeLessThan(
      runner.indexOf(
        `jj --at-operation=@ --ignore-working-copy --color=never --quiet`,
      ),
    );
    expect(runner).toContain(`op log --no-graph -n 1 -T 'id ++ "\\0"'`);
    expect(runner).toContain(
      `jj --at-operation="$sync_operation" --color=never --quiet`,
    );
    expect(runner).toContain(`log --no-graph -r @ -T 'commit_id ++ "\\0"'`);
    expect(runner).toContain(
      `file list -r "$sync_revision" -T 'path ++ "\\0"'`,
    );
    expect(runner).toContain("sync_archive_file");
    expect(runner).toContain("sync_manifest_source_file");
    expect(runner).toContain("validate-remote-qa-manifest.mjs");
    expect(runner).toContain("create-remote-qa-archive.mjs");
    expect(runner).toContain("validate-remote-qa-archive.sh");
    expect(runner).toContain(
      'node "$sync_manifest_validator" <"$sync_manifest_source_file"',
    );
    expect(runner).toContain(
      'node "$sync_archive_creator" "$sync_archive_file" "$sync_operation" "$sync_revision"',
    );
    expect(runner.indexOf('node "$sync_manifest_validator"')).toBeLessThan(
      runner.indexOf('node "$sync_archive_creator"'),
    );
    expect(runner).not.toContain('tar -czf "$sync_archive_file"');
    expect(runner).not.toContain('tar -tzf "$sync_archive_file"');
    expect(runner).not.toContain('cat "$sync_manifest_file" |');
    expect(syncSource).toContain("function Assert-SafeQaWorkRoot");
    expect(syncSource).toContain("function Test-QaPathAtOrBelow");
    expect(syncSource).toContain("^[A-Za-z]:[\\\\/]");
    expect(syncSource).toContain("$ProtectedTrees");
    expect(syncSource).toContain("foreach ($Segment in $Segments)");
    expect(syncSource).toContain("function Assert-QaWorkRootOwnership");
    expect(syncSource).toContain("function Remove-PrivateQaResidue");
    expect(syncSource).toContain("function Test-PrivateQaResidueRelativePath");
    expect(syncSource).toContain("[Collections.Generic.Stack[string]]::new()");
    expect(syncSource).toContain("[IO.FileAttributes]::ReparsePoint");
    expect(syncSource).toContain("function Remove-QaReparsePoint");
    expect(syncSource).toContain(
      "function Assert-ArchivePathsAvoidQaReparsePoints",
    );
    expect(syncSource).toContain(
      "Assert-ArchivePathsAvoidQaReparsePoints $target $ManifestPaths",
    );
    expect(
      syncSource.indexOf(
        "Assert-QaStagingMatchesManifest $StagingPath $ManifestPaths",
      ),
    ).toBeLessThan(
      syncSource.indexOf("Remove-PrivateQaResidue -RootPath $StagingPath"),
    );
    expect(
      syncSource.indexOf(
        "Assert-ArchivePathsAvoidQaReparsePoints $target $ManifestPaths",
      ),
    ).toBeLessThan(
      syncSource.indexOf(
        "Merge-QaStagedFiles $StagingPath $target $ManifestPaths",
      ),
    );
    expect(syncSource).toContain("[switch] $AllowAdoption");
    expect(syncSource).toContain("if (-not $AllowAdoption)");
    expect(syncSource).toContain(".ytm-enhancer-remote-qa-root");
    expect(syncSource).toContain('"YTM Enhancer remote QA root"');
    expect(syncSource).toContain("Windows QA work root marker is invalid.");
    expect(syncSource).toContain("Windows QA work root is not marked");
    expect(syncSource).toContain("function New-QaRootMarker");
    expect(syncSource).toContain(".remote-qa.env");
    expect(syncSource).toContain(".claude");
    expect(runner).not.toContain("COPYFILE_DISABLE=1 tar -czf -");
    expect(runner).not.toContain("--exclude apps/menu-bar/.build");
    expect(runner).not.toContain("--exclude apps/windows-tray/.build");
    expect(syncSource).toContain("tar -xzf $ArchivePath -C $StagingPath");
    expect(syncSource).toMatch(
      /tar -xzf \$ArchivePath -C \$StagingPath\s+if \(\$LASTEXITCODE -ne 0\)/,
    );
    expect(runner).not.toContain(
      "macOS QA runner is missing or not executable: $macos_runner",
    );
    expect(read("scripts/remote/windows-qa/probe.sh")).not.toContain(
      "macOS QA runner is missing or not executable: $macos_runner",
    );
    expect(runner).toContain(
      "Only files tracked by the current Jujutsu working-copy revision are synchronized.",
    );
    expect(runner).toContain(
      "Ignored files, including `.remote-qa.env` and build artifacts, are never archived.",
    );
    expect(crabboxRunner).toContain(
      'REMOTE_QA_WINDOWS_TRANSPORT="${REMOTE_QA_WINDOWS_TRANSPORT:-macos}"',
    );
    expect(crabboxRunner).toContain('exec "$script_dir/run.sh" "$@"');
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain(".envrc");
    expect(gitignore).toContain(".direnv/");
    expect(gitignore).toContain(".remote-qa.env*");
    expect(gitignore).toContain(".npmrc");
    expect(gitignore).toContain("*.pfx");
    expect(gitignore).toContain("*.key");
    expect(gitignore).toContain("id_ed25519.pub");
    expect(gitignore).toContain("authorized_keys");
  });

  it("rejects unsafe local SFTP paths before opening SSH", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-sftp-path-"));
    const unsafeTmp = join(fixtureRoot, 'unsafe"tmp');
    const fakeBin = join(fixtureRoot, "bin");
    const sshMarker = join(fixtureRoot, "ssh-called");
    try {
      mkdirSync(unsafeTmp);
      mkdirSync(fakeBin);
      const fakeSsh = join(fakeBin, "ssh");
      writeFileSync(
        fakeSsh,
        ["#!/usr/bin/env sh", ': >"$YTME_FAKE_SSH_MARKER"', "exit 0", ""].join(
          "\n",
        ),
      );
      chmodSync(fakeSsh, 0o755);

      const result = spawnSync(
        "sh",
        [
          resolve(process.cwd(), "scripts/remote/windows-qa/run.sh"),
          "--shell",
          'Write-Output "must not run"',
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            REMOTE_QA_CONFIG: "/dev/null",
            REMOTE_QA_WINDOWS_TRANSPORT: "direct",
            REMOTE_QA_WINDOWS_HOST: "fixture.invalid",
            REMOTE_QA_WINDOWS_USER: "fixture-user",
            REMOTE_QA_WINDOWS_PORT: "22",
            REMOTE_QA_WINDOWS_WORK_ROOT: "C:/qa/ytm-enhancer",
            TMPDIR: unsafeTmp,
            YTME_FAKE_SSH_MARKER: sshMarker,
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(existsSync(sshMarker)).toBe(false);
      expect(`${result.stdout}${result.stderr}`).not.toContain(unsafeTmp);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("cleans private transport files when SFTP fails", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-sftp-failure-"));
    const qaTmp = join(fixtureRoot, "tmp");
    const fakeBin = join(fixtureRoot, "bin");
    const sshMarker = join(fixtureRoot, "ssh-called");
    try {
      mkdirSync(qaTmp);
      mkdirSync(fakeBin);
      const fakeSsh = join(fakeBin, "ssh");
      const fakeSftp = join(fakeBin, "sftp");
      writeFileSync(
        fakeSsh,
        [
          "#!/usr/bin/env sh",
          'printf "called\\n" >>"$YTME_FAKE_SSH_MARKER"',
          "exit 0",
          "",
        ].join("\n"),
      );
      writeFileSync(fakeSftp, ["#!/usr/bin/env sh", "exit 1", ""].join("\n"));
      chmodSync(fakeSsh, 0o755);
      chmodSync(fakeSftp, 0o755);

      const result = spawnSync(
        "sh",
        [
          resolve(process.cwd(), "scripts/remote/windows-qa/run.sh"),
          "--shell",
          'Write-Output "must not run"',
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            REMOTE_QA_CONFIG: "/dev/null",
            REMOTE_QA_WINDOWS_TRANSPORT: "direct",
            REMOTE_QA_WINDOWS_HOST: "fixture.invalid",
            REMOTE_QA_WINDOWS_USER: "fixture-user",
            REMOTE_QA_WINDOWS_PORT: "22",
            REMOTE_QA_WINDOWS_WORK_ROOT: "C:/qa/ytm-enhancer",
            TMPDIR: qaTmp,
            YTME_FAKE_SSH_MARKER: sshMarker,
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(existsSync(sshMarker), `${result.stdout}${result.stderr}`).toBe(
        true,
      );
      expect(readFileSync(sshMarker, "utf8").trim().split("\n").length).toBe(2);
      expect(readdirSync(qaTmp)).toEqual([]);
      expect(`${result.stdout}${result.stderr}`).not.toContain(fixtureRoot);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("redacts direct Windows command output before replaying it", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-direct-output-"));
    const qaTmp = join(fixtureRoot, "tmp");
    const fakeBin = join(fixtureRoot, "bin");
    const sshMarker = join(fixtureRoot, "ssh-called");
    const privateHost = "private-host.fixture.invalid";
    const privateUser = "private-windows-user";
    const privateWorkRoot =
      "C:\\Users\\private-windows-user\\work\\ytm-enhancer";
    const privateWorkRootWithSlashes =
      "C:/Users/private-windows-user/work/ytm-enhancer";
    const privateHostMixedCase = "PrIvAtE-HoSt.FiXtUrE.InVaLiD";
    const privateUserMixedCase = "PrIvAtE-WiNdOwS-UsEr";
    const privateWorkRootMixedCase =
      "c:\\uSeRs\\PrIvAtE-WiNdOwS-UsEr\\WoRk\\YtM-EnHaNcEr";
    const privateWorkRootJsonEscaped = privateWorkRoot.replaceAll("\\", "\\\\");
    try {
      mkdirSync(qaTmp);
      mkdirSync(fakeBin);
      const fakeSsh = join(fakeBin, "ssh");
      const fakeSftp = join(fakeBin, "sftp");
      writeFileSync(
        fakeSsh,
        [
          "#!/usr/bin/env sh",
          'printf "called\\n" >>"$YTME_FAKE_SSH_MARKER"',
          'printf "%s\\n" "$YTME_PRIVATE_HOST"',
          'printf "%s\\n" "$YTME_PRIVATE_USER"',
          'printf "%s\\n" "$YTME_PRIVATE_WORK_ROOT"',
          'printf "%s\\n" "$YTME_PRIVATE_WORK_ROOT_WITH_SLASHES"',
          'printf "%s\\n" "$YTME_PRIVATE_HOST_MIXED_CASE"',
          'printf "%s\\n" "$YTME_PRIVATE_USER_MIXED_CASE"',
          'printf "%s\\n" "$YTME_PRIVATE_WORK_ROOT_MIXED_CASE"',
          'printf "%s\\n" "$YTME_PRIVATE_WORK_ROOT_JSON_ESCAPED"',
          "exit 0",
          "",
        ].join("\n"),
      );
      writeFileSync(fakeSftp, ["#!/usr/bin/env sh", "exit 0", ""].join("\n"));
      chmodSync(fakeSsh, 0o755);
      chmodSync(fakeSftp, 0o755);

      const result = spawnSync(
        "sh",
        [
          resolve(process.cwd(), "scripts/remote/windows-qa/run.sh"),
          "--shell",
          'Write-Output "safe output"',
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            REMOTE_QA_CONFIG: "/dev/null",
            REMOTE_QA_WINDOWS_TRANSPORT: "direct",
            REMOTE_QA_WINDOWS_HOST: privateHost,
            REMOTE_QA_WINDOWS_USER: privateUser,
            REMOTE_QA_WINDOWS_PORT: "22",
            REMOTE_QA_WINDOWS_WORK_ROOT: privateWorkRoot,
            TMPDIR: qaTmp,
            YTME_FAKE_SSH_MARKER: sshMarker,
            YTME_PRIVATE_HOST: privateHost,
            YTME_PRIVATE_USER: privateUser,
            YTME_PRIVATE_WORK_ROOT: privateWorkRoot,
            YTME_PRIVATE_WORK_ROOT_WITH_SLASHES: privateWorkRootWithSlashes,
            YTME_PRIVATE_HOST_MIXED_CASE: privateHostMixedCase,
            YTME_PRIVATE_USER_MIXED_CASE: privateUserMixedCase,
            YTME_PRIVATE_WORK_ROOT_MIXED_CASE: privateWorkRootMixedCase,
            YTME_PRIVATE_WORK_ROOT_JSON_ESCAPED: privateWorkRootJsonEscaped,
          },
        },
      );

      const output = `${result.stdout}${result.stderr}`;
      expect(result.status, output).toBe(0);
      expect(output).toContain("[windows-remote-host]");
      expect(output).toContain("[windows-remote-user]");
      expect(output).toContain("[windows-remote-work-root]");
      expect(output).not.toContain(privateHost);
      expect(output).not.toContain(privateUser);
      expect(output).not.toContain(privateWorkRoot);
      expect(output).not.toContain(privateWorkRootWithSlashes);
      expect(output).not.toContain(privateHostMixedCase);
      expect(output).not.toContain(privateUserMixedCase);
      expect(output).not.toContain(privateWorkRootMixedCase);
      expect(output).not.toContain(privateWorkRootJsonEscaped);
      expect(readdirSync(qaTmp)).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("cleans private transport files when SFTP is interrupted", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-sftp-signal-"));
    const qaTmp = join(fixtureRoot, "tmp");
    const fakeBin = join(fixtureRoot, "bin");
    const sshMarker = join(fixtureRoot, "ssh-called");
    try {
      mkdirSync(qaTmp);
      mkdirSync(fakeBin);
      const fakeSsh = join(fakeBin, "ssh");
      const fakeSftp = join(fakeBin, "sftp");
      writeFileSync(
        fakeSsh,
        [
          "#!/usr/bin/env sh",
          'printf "called\\n" >>"$YTME_FAKE_SSH_MARKER"',
          "exit 0",
          "",
        ].join("\n"),
      );
      writeFileSync(
        fakeSftp,
        ["#!/usr/bin/env sh", 'kill -TERM "$PPID"', "exit 1", ""].join("\n"),
      );
      chmodSync(fakeSsh, 0o755);
      chmodSync(fakeSftp, 0o755);

      const result = spawnSync(
        "sh",
        [
          resolve(process.cwd(), "scripts/remote/windows-qa/run.sh"),
          "--shell",
          'Write-Output "must not run"',
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            REMOTE_QA_CONFIG: "/dev/null",
            REMOTE_QA_WINDOWS_TRANSPORT: "direct",
            REMOTE_QA_WINDOWS_HOST: "fixture.invalid",
            REMOTE_QA_WINDOWS_USER: "fixture-user",
            REMOTE_QA_WINDOWS_PORT: "22",
            REMOTE_QA_WINDOWS_WORK_ROOT: "C:/qa/ytm-enhancer",
            TMPDIR: qaTmp,
            YTME_FAKE_SSH_MARKER: sshMarker,
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(existsSync(sshMarker), `${result.stdout}${result.stderr}`).toBe(
        true,
      );
      expect(readFileSync(sshMarker, "utf8").trim().split("\n").length).toBe(2);
      expect(readdirSync(qaTmp)).toEqual([]);
      expect(`${result.stdout}${result.stderr}`).not.toContain(fixtureRoot);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("syncs safely around unrelated Windows junctions", () => {
    if (process.platform !== "win32") {
      return;
    }

    const syncSourcePath = resolve(
      process.cwd(),
      "scripts/windows-qa/sync-source.ps1",
    ).replaceAll("'", "''");
    const fixture = `
$ErrorActionPreference = "Stop"
$sourcePath = '${syncSourcePath}'
$sourceText = [IO.File]::ReadAllText($sourcePath)
$hashStart = $sourceText.IndexOf("function Get-YtmeFileSha256")
$hashEnd = $sourceText.IndexOf("function Get-NormalizedQaPath")
if ($hashStart -lt 0 -or $hashEnd -le $hashStart) {
  throw "Source hash helper boundary was not found."
}
. ([scriptblock]::Create(
  $sourceText.Substring($hashStart, $hashEnd - $hashStart)
))
$root = Join-Path ([IO.Path]::GetTempPath()) (
  "ytme-safe-sync-" + [guid]::NewGuid().ToString("N")
)
$outsideRoot = "$root-outside"
$junctionPath = Join-Path $root "node_modules"
$safeSource = "$root-safe-source"
$unsafeSource = "$root-unsafe-source"
$privateSource = "$root-private-source"
$safeArchive = "$root-safe.tar.gz"
$unsafeArchive = "$root-unsafe.tar.gz"
$privateArchive = "$root-private.tar.gz"
$staleStagingPath = Join-Path (
  [IO.Path]::GetDirectoryName($root)
) (".ytme-source-staging-" + [guid]::NewGuid().ToString("N"))
$staleMergePath = Join-Path $root (
  "orphan.ytme-sync-" + [guid]::NewGuid().ToString("N")
)
$staleBackupPath = Join-Path $root (
  "orphan.ytme-sync-backup-" + [guid]::NewGuid().ToString("N")
)
try {
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  New-Item -ItemType Directory -Force -Path $outsideRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $safeSource | Out-Null
  New-Item -ItemType Directory -Force -Path $privateSource | Out-Null
  New-Item -ItemType Directory -Path $staleStagingPath | Out-Null
  (Get-Item -LiteralPath $staleStagingPath).LastWriteTimeUtc = (
    [DateTime]::UtcNow.AddHours(-2)
  )
  New-Item -ItemType Directory -Force -Path (
    Join-Path $unsafeSource "node_modules"
  ) |
    Out-Null
  [IO.File]::WriteAllText(
    (Join-Path $root ".ytm-enhancer-remote-qa-root"),
    "fixture"
  )
  [IO.File]::WriteAllText(
    (Join-Path $outsideRoot "sentinel.txt"),
    "outside sentinel"
  )
  [IO.File]::WriteAllText(
    (Join-Path $safeSource "PROJECT.md"),
    "safe source"
  )
  [IO.File]::WriteAllText(
    (Join-Path $unsafeSource "node_modules\\payload.txt"),
    "unsafe payload"
  )
  [IO.File]::WriteAllText(
    (Join-Path $unsafeSource "partial.txt"),
    "must not be copied"
  )
  [IO.File]::WriteAllText(
    (Join-Path $privateSource "PROJECT.md"),
    "safe source"
  )
  [IO.File]::WriteAllText(
    (Join-Path $privateSource ".remote-qa.env.local"),
    "must be rejected"
  )
  [IO.File]::WriteAllText($staleMergePath, "expired merge")
  [IO.File]::WriteAllText($staleBackupPath, "expired backup")
  (Get-Item -LiteralPath $staleMergePath).LastWriteTimeUtc = (
    [DateTime]::UtcNow.AddHours(-2)
  )
  (Get-Item -LiteralPath $staleBackupPath).LastWriteTimeUtc = (
    [DateTime]::UtcNow.AddHours(-2)
  )
  New-Item -ItemType Junction -Path $junctionPath -Target $outsideRoot |
    Out-Null

  & tar.exe -czf $safeArchive -C $safeSource "PROJECT.md"
  if ($LASTEXITCODE -ne 0) {
    throw "Safe fixture archive creation failed."
  }
  & tar.exe -czf $unsafeArchive -C $unsafeSource "partial.txt" "node_modules/payload.txt"
  if ($LASTEXITCODE -ne 0) {
    throw "Unsafe fixture archive creation failed."
  }
  & tar.exe -czf $privateArchive -C $privateSource "PROJECT.md" ".remote-qa.env.local"
  if ($LASTEXITCODE -ne 0) {
    throw "Private fixture archive creation failed."
  }

  function Invoke-FixtureSync {
    param(
      [Parameter(Mandatory = $true)][string] $ArchivePathValue,
      [Parameter(Mandatory = $true)][string[]] $ManifestPaths,
      [switch] $Preserve
    )

    $target = $root
    $ArchivePath = $ArchivePathValue
    $PreserveApps = [bool] $Preserve
    $AdoptWorkRoot = $false
    $ExpectedArchiveLength = (
      Get-Item -LiteralPath $ArchivePath -Force
    ).Length
    $ExpectedArchiveSha256 = Get-YtmeFileSha256 -Path $ArchivePath
    $ManifestText = (
      [string]::Join([char] 0, $ManifestPaths) +
      [char] 0
    )
    $ManifestBase64 = [Convert]::ToBase64String(
      [Text.Encoding]::UTF8.GetBytes($ManifestText)
    )
    & $sourcePath
  }

  $invalidMarkerRejected = $false
  try {
    Invoke-FixtureSync \`
      -ArchivePathValue $safeArchive \`
      -ManifestPaths @("PROJECT.md") \`
      -Preserve
  } catch {
    $invalidMarkerRejected = $true
  }
  if (-not $invalidMarkerRejected) {
    throw "Sync accepted a work root marker with invalid provenance."
  }
  [IO.File]::WriteAllText(
    (Join-Path $root ".ytm-enhancer-remote-qa-root"),
    "YTM Enhancer remote QA root"
  )

  Invoke-FixtureSync -ArchivePathValue $safeArchive -ManifestPaths @("PROJECT.md") -Preserve
  if (Test-Path -LiteralPath $staleStagingPath) {
    throw "Sync did not remove an expired managed staging directory."
  }
  if (
    (Test-Path -LiteralPath $staleMergePath) -or
    (Test-Path -LiteralPath $staleBackupPath)
  ) {
    throw "Sync did not remove expired managed merge artifacts."
  }
  if (-not (Test-Path -LiteralPath $junctionPath -PathType Container)) {
    throw "Preserve sync removed an unrelated junction."
  }
  if (
    [IO.File]::ReadAllText(
      (Join-Path $outsideRoot "sentinel.txt")
    ) -ne "outside sentinel"
  ) {
    throw "Preserve sync changed data behind an unrelated junction."
  }

  $privateSyncBlocked = $false
  try {
    Invoke-FixtureSync -ArchivePathValue $privateArchive -ManifestPaths @("PROJECT.md") -Preserve
  } catch {
    $privateSyncBlocked = $true
  }
  if (-not $privateSyncBlocked) {
    throw "Preserve sync accepted an archive member outside the manifest."
  }

  $unsafeSyncBlocked = $false
  try {
    Invoke-FixtureSync -ArchivePathValue $unsafeArchive -ManifestPaths @("partial.txt", "node_modules/payload.txt") -Preserve
  } catch {
    $unsafeSyncBlocked = $true
  }
  if (-not $unsafeSyncBlocked) {
    throw "Preserve sync accepted an archive path through a junction."
  }
  if (Test-Path -LiteralPath (Join-Path $outsideRoot "payload.txt")) {
    throw "Preserve sync wrote through a junction."
  }
  if (Test-Path -LiteralPath (Join-Path $root "partial.txt")) {
    throw "Preserve sync partially applied an unsafe archive."
  }

  Invoke-FixtureSync -ArchivePathValue $safeArchive -ManifestPaths @("PROJECT.md")
  if (
    [IO.File]::ReadAllText(
      (Join-Path $outsideRoot "sentinel.txt")
    ) -ne "outside sentinel"
  ) {
    throw "Full sync changed data behind a removed junction."
  }
  if (
    [IO.File]::ReadAllText(
      (Join-Path $root "PROJECT.md")
    ) -ne "safe source"
  ) {
    throw "Full sync did not extract the safe source."
  }
} finally {
  if (Test-Path -LiteralPath $junctionPath) {
    [IO.Directory]::Delete($junctionPath, $false)
  }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $outsideRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $safeSource -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $unsafeSource -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $privateSource -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $safeArchive -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $unsafeArchive -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $privateArchive -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $staleStagingPath) {
    Remove-Item -LiteralPath $staleStagingPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`;
    const result = runWindowsPowerShell(fixture);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("fails closed before archiving private remote-QA paths", () => {
    const validator = resolve(
      process.cwd(),
      "scripts/validate-remote-qa-manifest.mjs",
    );
    const runValidator = (
      paths: string[],
      terminate = true,
      cwd = process.cwd(),
    ) =>
      spawnSync(process.execPath, [validator], {
        cwd,
        input: Buffer.from(paths.join("\0") + (terminate ? "\0" : "")),
      });

    const safe = runValidator([
      "PROJECT.md",
      "src/core/ytm-client.ts",
      "tests/e2e/fixtures/player-loaded-paused.html",
    ]);
    expect(safe.status).toBe(0);
    expect(safe.stdout).toEqual(
      Buffer.from(
        [
          "PROJECT.md",
          "src/core/ytm-client.ts",
          "tests/e2e/fixtures/player-loaded-paused.html",
          "",
        ].join("\0"),
      ),
    );

    const privateInstructions = runValidator(["CLAUDE.md"]);
    expect(privateInstructions.status).toBe(0);
    expect(privateInstructions.stdout).toHaveLength(0);

    for (const privatePath of [
      ".env",
      ".envrc",
      ".env.production",
      ".remote-qa.env",
      ".remote-qa.env.local",
      "nested/.remote-qa.env",
      ".direnv/allow",
      ".npmrc",
      ".ssh/id_ed25519",
      ".codex/state.json",
      ".claude/settings.local.json",
      ".git/config",
      "known_hosts",
      "id_rsa",
      "secrets/private.pem",
      "certificates/client.key",
      "certificates/release.pfx",
      "C:/private.txt",
      "safe/file.txt:private-stream",
      "nested/.git./config",
      "nested/.ssh /known_hosts",
      "nested/CON.txt",
      "nested/com1.log",
    ]) {
      const result = runValidator([privatePath]);
      expect(result.status, privatePath).not.toBe(0);
      expect(
        Buffer.concat([result.stdout, result.stderr]).toString(),
      ).not.toContain(privatePath);
    }

    expect(runValidator(["PROJECT.md"], false).status).not.toBe(0);

    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-manifest-types-"));
    try {
      writeFileSync(join(fixtureRoot, "regular.txt"), "fixture");
      mkdirSync(join(fixtureRoot, "directory"));
      mkdirSync(join(fixtureRoot, "node_modules"));
      writeFileSync(
        join(fixtureRoot, "node_modules", "package.json"),
        "fixture",
      );
      writeFileSync(join(fixtureRoot, "CaseFile.txt"), "fixture");
      if (process.platform !== "win32") {
        writeFileSync(join(fixtureRoot, "casefile.txt"), "fixture");
      }
      linkSync(
        join(fixtureRoot, "regular.txt"),
        join(fixtureRoot, "hardlink.txt"),
      );

      expect(
        runValidator(["node_modules/package.json"], true, fixtureRoot).status,
      ).not.toBe(0);
      expect(
        runValidator(["CaseFile.txt", "casefile.txt"], true, fixtureRoot)
          .status,
      ).not.toBe(0);
      expect(runValidator(["directory"], true, fixtureRoot).status).not.toBe(0);
      expect(runValidator(["regular.txt"], true, fixtureRoot).status).not.toBe(
        0,
      );
      expect(runValidator(["hardlink.txt"], true, fixtureRoot).status).not.toBe(
        0,
      );

      try {
        symlinkSync("regular.txt", join(fixtureRoot, "symlink.txt"));
        expect(
          runValidator(["symlink.txt"], true, fixtureRoot).status,
        ).not.toBe(0);
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            (error.code === "EPERM" || error.code === "EACCES")
          )
        ) {
          throw error;
        }
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("creates metadata-normalized regular-only remote QA archives", () => {
    if (process.platform === "win32") {
      return;
    }

    const creator = resolve(
      process.cwd(),
      "scripts/create-remote-qa-archive.mjs",
    );
    const validator = resolve(
      process.cwd(),
      "scripts/validate-remote-qa-archive.sh",
    );
    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-archive-types-"));
    const sourceRoot = join(fixtureRoot, "source");
    const normalizedArchive = join(fixtureRoot, "normalized.tar.gz");
    const regularArchive = join(fixtureRoot, "regular.tar.gz");
    const directoryArchive = join(fixtureRoot, "directory.tar.gz");
    const hardlinkArchive = join(fixtureRoot, "hardlink.tar.gz");
    try {
      mkdirSync(join(sourceRoot, "directory"), { recursive: true });
      writeFileSync(join(sourceRoot, "regular.txt"), "fixture");
      writeFileSync(join(sourceRoot, "directory", "nested.txt"), "fixture");
      expect(
        spawnSync("jj", ["git", "init", "--no-colocate"], {
          cwd: sourceRoot,
          encoding: "utf8",
        }).status,
      ).toBe(0);
      const snapshotResult = spawnSync(
        "jj",
        ["log", "-r", "@", "--no-graph", "-T", "commit_id"],
        {
          cwd: sourceRoot,
          encoding: "utf8",
        },
      );
      expect(snapshotResult.status, snapshotResult.stderr).toBe(0);
      const operationResult = spawnSync(
        "jj",
        [
          "--at-operation=@",
          "--ignore-working-copy",
          "op",
          "log",
          "--no-graph",
          "-n",
          "1",
          "-T",
          "id",
        ],
        {
          cwd: sourceRoot,
          encoding: "utf8",
        },
      );
      expect(operationResult.status, operationResult.stderr).toBe(0);
      const operation = operationResult.stdout.trim();
      expect(operation).toMatch(/^[0-9a-f]{64,128}$/);
      const revisionResult = spawnSync(
        "jj",
        [
          `--at-operation=${operation}`,
          "--color=never",
          "--quiet",
          "log",
          "--no-graph",
          "-r",
          "@",
          "-T",
          "commit_id",
        ],
        {
          cwd: sourceRoot,
          encoding: "utf8",
        },
      );
      expect(revisionResult.status, revisionResult.stderr).toBe(0);
      const revision = revisionResult.stdout.trim();
      expect(revision).toMatch(/^[0-9a-f]{40,64}$/);
      writeFileSync(join(sourceRoot, "regular.txt"), "changed after snapshot");

      const normalized = spawnSync(
        process.execPath,
        [creator, normalizedArchive, operation, revision],
        {
          cwd: sourceRoot,
          encoding: "utf8",
          input: "regular.txt\0",
        },
      );
      expect(normalized.status, normalized.stderr).toBe(0);
      expect(
        spawnSync("sh", [validator, normalizedArchive], {
          encoding: "utf8",
        }).status,
      ).toBe(0);

      const gzip = readFileSync(normalizedArchive);
      expect(gzip.subarray(0, 4)).toEqual(
        Buffer.from([0x1f, 0x8b, 0x08, 0x00]),
      );
      expect(gzip.subarray(4, 8)).toEqual(Buffer.alloc(4));
      expect(gzip[9]).toBe(255);
      const tar = gunzipSync(gzip);
      const header = tar.subarray(0, 512);
      expect(header.subarray(0, 100).toString().replace(/\0.*$/s, "")).toBe(
        "regular.txt",
      );
      expect(header.subarray(108, 116).toString()).toMatch(/^0{7}\0$/);
      expect(header.subarray(116, 124).toString()).toMatch(/^0{7}\0$/);
      expect(header.subarray(136, 148).toString()).toMatch(/^0{11}\0$/);
      expect(String.fromCharCode(header[156] ?? 0)).toBe("0");
      expect(header.subarray(257, 263).toString()).toBe("ustar\0");
      expect(header.subarray(265, 297).toString().replace(/\0.*$/s, "")).toBe(
        "root",
      );
      expect(header.subarray(297, 329).toString().replace(/\0.*$/s, "")).toBe(
        "root",
      );
      expect(tar.subarray(512, 519).toString()).toBe("fixture");

      expect(
        spawnSync(
          "tar",
          ["-czf", regularArchive, "-C", sourceRoot, "regular.txt"],
          { encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(
        spawnSync("sh", [validator, regularArchive], {
          encoding: "utf8",
        }).status,
      ).not.toBe(0);

      expect(
        spawnSync(
          "tar",
          ["-czf", directoryArchive, "-C", sourceRoot, "directory"],
          { encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(
        spawnSync("sh", [validator, directoryArchive], {
          encoding: "utf8",
        }).status,
      ).not.toBe(0);

      linkSync(
        join(sourceRoot, "regular.txt"),
        join(sourceRoot, "hardlink.txt"),
      );
      expect(
        spawnSync(
          "tar",
          [
            "-czf",
            hardlinkArchive,
            "-C",
            sourceRoot,
            "regular.txt",
            "hardlink.txt",
          ],
          { encoding: "utf8" },
        ).status,
      ).toBe(0);
      expect(
        spawnSync("sh", [validator, hardlinkArchive], {
          encoding: "utf8",
        }).status,
      ).not.toBe(0);

      try {
        rmSync(join(sourceRoot, "hardlink.txt"));
        symlinkSync("regular.txt", join(sourceRoot, "symlink.txt"));
        const symlinkSnapshot = spawnSync(
          "jj",
          ["log", "-r", "@", "--no-graph", "-T", "commit_id"],
          {
            cwd: sourceRoot,
            encoding: "utf8",
          },
        );
        expect(symlinkSnapshot.status, symlinkSnapshot.stderr).toBe(0);
        const symlinkOperationResult = spawnSync(
          "jj",
          [
            "--at-operation=@",
            "--ignore-working-copy",
            "op",
            "log",
            "--no-graph",
            "-n",
            "1",
            "-T",
            "id",
          ],
          {
            cwd: sourceRoot,
            encoding: "utf8",
          },
        );
        expect(
          symlinkOperationResult.status,
          symlinkOperationResult.stderr,
        ).toBe(0);
        const symlinkOperation = symlinkOperationResult.stdout.trim();
        const symlinkRevisionResult = spawnSync(
          "jj",
          [
            `--at-operation=${symlinkOperation}`,
            "--color=never",
            "--quiet",
            "log",
            "--no-graph",
            "-r",
            "@",
            "-T",
            "commit_id",
          ],
          {
            cwd: sourceRoot,
            encoding: "utf8",
          },
        );
        expect(symlinkRevisionResult.status, symlinkRevisionResult.stderr).toBe(
          0,
        );
        expect(
          spawnSync(
            process.execPath,
            [
              creator,
              normalizedArchive,
              symlinkOperation,
              symlinkRevisionResult.stdout.trim(),
            ],
            {
              cwd: sourceRoot,
              encoding: "utf8",
              input: "symlink.txt\0",
            },
          ).status,
        ).not.toBe(0);
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            (error.code === "EPERM" || error.code === "EACCES")
          )
        ) {
          throw error;
        }
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("uses Windows-native checks instead of the POSIX check script", () => {
    const check = read("scripts/windows-qa/check.ps1");
    const checkShell = read("scripts/remote/windows-qa/check.sh");
    const ensurePnpm = read("scripts/windows-qa/ensure-pnpm.ps1");

    expect(check).toContain('ensure-pnpm.ps1"');
    expect(check).toContain("Ensure-Pnpm");
    expect(check).toContain("Invoke-Pnpm run format:check");
    expect(check).toContain("Invoke-Pnpm run lint");
    expect(check).toContain("Invoke-Native go -C apps/cli test ./...");
    expect(check).toContain("Invoke-Pnpm run dev:build:edge");
    expect(check).not.toContain("pnpm run check");
    expect(check).not.toContain("corepack enable");
    expect(ensurePnpm).toContain("Get-Command pnpm.cmd");
    expect(ensurePnpm).toContain("Get-Command pnpm");
    expect(ensurePnpm).toContain("Get-Command corepack");
    expect(ensurePnpm).toContain("function Invoke-Pnpm");
    expect(ensurePnpm).toContain("npm install -g pnpm@$RequiredVersion");
    expect(checkShell).toContain("scripts\\windows-qa\\check.ps1");
  });

  it("keeps Windows browser e2e scoped to Edge", () => {
    const e2e = read("scripts/windows-qa/e2e-edge-smoke.ps1");
    const e2eShell = read("scripts/remote/windows-qa/e2e-edge-smoke.sh");

    expect(e2e).toContain("Invoke-Pnpm run dev:build:edge");
    expect(e2e).toContain("playwright test tests/e2e --project=edge");
    expect(e2eShell).toContain("scripts\\windows-qa\\e2e-edge-smoke.ps1");
  });

  it("automates Windows tray visual smoke through the active desktop", () => {
    const visualSmoke = read("scripts/windows-qa/tray-visual-smoke.ps1");
    const visualSmokeShell = read(
      "scripts/remote/windows-qa/tray-visual-smoke.sh",
    );

    expect(visualSmoke).toContain("ui-agent-client.ps1");
    expect(visualSmoke).toContain("Wait-WindowsQaUiAgentReady");
    expect(visualSmoke).toContain("Invoke-InteractivePowerShell");
    expect(visualSmoke).toContain("UiReadyTimeoutSeconds");
    expect(visualSmoke).not.toContain("New-ScheduledTaskPrincipal");
    expect(visualSmoke).toContain("UIAutomationClient");
    expect(visualSmoke).toContain("Show Hidden Icons");
    expect(visualSmoke).toContain("YTM Enhancer");
    expect(visualSmoke).toContain("YTM Tray");
    expect(visualSmoke).toContain("YTM_TRAY_SCROLL_QA");
    expect(visualSmoke).toContain("metadata scroll advanced");
    expect(visualSmoke).toContain("tray-popup.png");
    expect(visualSmokeShell).toContain(
      "scripts\\windows-qa\\tray-visual-smoke.ps1",
    );
    expect(visualSmokeShell).toContain(
      "YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS",
    );
    expect(visualSmokeShell).toContain("-UiReadyTimeoutSeconds");
  });

  it("captures the release screenshot through the real tray connector smoke", () => {
    const releaseScreenshot = read(
      "scripts/windows-qa/tray-release-screenshot.ps1",
    );
    const releaseScreenshotShell = read(
      "scripts/remote/windows-qa/tray-release-screenshot.sh",
    );
    const releaseScreenshotMask = read(
      "apps/windows-tray/scripts/mask-release-screenshot.mjs",
    );
    const trayE2e = read("tests/e2e/windows-tray-connector.spec.ts");
    const docs = read("docs/remote-qa.md");

    expect(releaseScreenshot).toContain(
      "$env:YTME_WINDOWS_TRAY_SCREENSHOT_PATH",
    );
    expect(releaseScreenshot).toContain(
      "$env:YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL",
    );
    expect(releaseScreenshot).toContain(
      "$env:YTME_WINDOWS_TRAY_SIGNED_INSTALLER_PATH",
    );
    expect(releaseScreenshot).toContain("[string] $SignedInstallerPath");
    expect(releaseScreenshot).toContain("Get-AuthenticodeSignature");
    expect(releaseScreenshot).toContain(
      "approved Creative Commons YouTube Music track",
    );
    expect(releaseScreenshot).toContain("Remove-Item Env:YTM_TRAY_VISUAL_DEMO");
    expect(releaseScreenshot).toContain("Remove-Item Env:YTM_TRAY_SCROLL_QA");
    expect(releaseScreenshot).toContain("Invoke-Pnpm run dev:build:edge");
    expect(releaseScreenshot).toContain(
      "tests/e2e/windows-tray-connector.spec.ts",
    );
    expect(releaseScreenshot).toContain("--project=edge");
    expect(trayE2e).toContain("Move-CursorAwayFromRectangle");
    expect(releaseScreenshotShell).toContain(
      "scripts\\windows-qa\\tray-release-screenshot.ps1",
    );
    expect(releaseScreenshotShell).toContain("-PlaybackUrl");
    expect(releaseScreenshotShell).toContain(
      "YTME_WINDOWS_TRAY_SIGNED_INSTALLER_PATH",
    );
    expect(releaseScreenshotShell).toContain("-SignedInstallerPath");
    expect(releaseScreenshotShell).toContain("YTME_SCREENSHOT_BASE64_BEGIN");
    expect(releaseScreenshotShell).toContain("YTME_SCREENSHOT_BASE64_CHUNK");
    expect(releaseScreenshotShell).toContain("final = block");
    expect(releaseScreenshotShell).toContain(
      "capture && /^YTME_SCREENSHOT_BASE64_CHUNK /",
    );
    expect(releaseScreenshotShell).toContain("base64 --decode");
    expect(releaseScreenshotShell).toContain('<"$encoded_file"');
    expect(releaseScreenshotShell).toContain("mask-release-screenshot.mjs");
    expect(releaseScreenshotMask).toContain('from "sharp"');
    expect(releaseScreenshotMask).toContain('blend: "dest-in"');
    expect(trayE2e).toContain("Save-TrayPopupScreenshot");
    expect(trayE2e).toContain("YTME_WINDOWS_TRAY_SCREENSHOT_PATH");
    expect(trayE2e).toContain("YTME_WINDOWS_TRAY_SIGNED_INSTALLER_PATH");
    expect(trayE2e).toContain("Get-AuthenticodeSignature");
    expect(trayE2e).toContain("--additional-allowed-origin");
    expect(trayE2e).not.toContain("--runtime-identifier");
    expect(trayE2e).toContain("function signedTrayInstallScript");
    expect(trayE2e).toContain("function signedTrayUninstallScript");
    expect(trayE2e).toContain(
      "UIAutomationClientsideProviders.UIAutomationClientSideProviders",
    );
    expect(trayE2e).toContain(
      "ClientSettings]::RegisterClientSideProviderAssembly",
    );
    expect(trayE2e).toContain(
      "$InstallProcess = Start-Process -FilePath $SignedInstallerPath",
    );
    expect(trayE2e).toContain(
      "$UninstallProcess = Start-Process -FilePath $SetupPath",
    );
    expect(trayE2e).toContain("-Wait -PassThru");
    expect(trayE2e).toContain("$InstallProcess.ExitCode -ne 0");
    expect(trayE2e).toContain("$UninstallProcess.ExitCode -ne 0");
    expect(trayE2e).not.toContain("& $SignedInstallerPath");
    expect(trayE2e).not.toContain("& $SetupPath");
    expect(trayE2e).toContain(
      '$SetupPath = Join-Path $InstallRoot "YTMTray.Setup.exe"',
    );
    expect(trayE2e).toContain(": trayInstallScript(");
    expect(trayE2e).toContain(": trayUninstallScript(installRoot)");
    expect(docs).toContain("YTME_WINDOWS_TRAY_SIGNED_INSTALLER_PATH");
    expect(docs).toContain("outside the Windows remote QA");
    expect(docs).toContain("work root. Then provide that path");
  });

  it("preflights the .NET 10 runtime needed by tray unit smoke", () => {
    const traySmoke = read("scripts/windows-qa/tray-smoke.ps1");

    expect(traySmoke).toContain("dotnet --list-runtimes");
    expect(traySmoke).toContain("Microsoft\\.NETCore\\.App");
    expect(traySmoke).toContain("net10.0");
  });

  it("automates Windows tray release package smoke", () => {
    const packageSmoke = read("scripts/windows-qa/tray-package-smoke.ps1");
    const explorerArchiveCheck = read(
      "scripts/windows-qa/assert-explorer-archive-compatible.ps1",
    );
    const packageSmokeShell = read(
      "scripts/remote/windows-qa/tray-package-smoke.sh",
    );

    expect(packageSmoke).toContain('ensure-pnpm.ps1"');
    expect(packageSmoke).toContain("Invoke-Pnpm install --frozen-lockfile");
    expect(packageSmoke).toContain("windows-tray:package:win-x64");
    expect(packageSmoke).toContain("windows-tray:package:win-arm64");
    expect(packageSmoke).toContain("windows-tray:installer");
    expect(packageSmoke).toContain("windows-tray:update-manifest");
    expect(packageSmoke).toContain("--package=$ArchivePath");
    expect(packageSmoke).toContain("Invoke-Pnpm @ManifestCommand");
    expect(packageSmoke).toContain("YTM-Tray-update.json");
    expect(packageSmoke).toContain("YTM-Tray-$($Metadata.version)-Setup.exe");
    expect(packageSmoke).toContain("assert-explorer-archive-compatible.ps1");
    expect(packageSmoke).toContain("-FilePath powershell.exe");
    expect(packageSmoke).toContain("-Arguments @(");
    expect(packageSmoke).toContain("-STA");
    expect(explorerArchiveCheck).toContain("Assert-ExplorerArchiveCompatible");
    expect(explorerArchiveCheck).toContain("Shell.Application");
    expect(explorerArchiveCheck).toContain("NameSpace");
    expect(explorerArchiveCheck).toContain("ZipFile]::OpenRead");
    expect(explorerArchiveCheck).toContain("GetApartmentState");
    expect(explorerArchiveCheck).not.toContain("CopyHere");
    expect(packageSmoke).toContain("Expand-Archive");
    expect(packageSmoke).toContain("install-native-hosts.ps1");
    expect(packageSmoke).toContain("YTMTray.Setup.exe");
    expect(packageSmoke).toContain("-FilePath $CombinedInstallerPath");
    expect(packageSmoke).toContain("-FilePath $FilePath");
    expect(packageSmoke).toContain("-Wait");
    expect(packageSmoke).toContain("$Process.ExitCode");
    expect(packageSmoke).not.toContain("Uninstall YTM Tray.cmd");
    expect(packageSmoke).toContain(
      "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\YTMTray",
    );
    expect(packageSmoke).toContain("Start Menu\\Programs\\YTM Enhancer");
    expect(packageSmoke).toContain("Get-Item -LiteralPath $ExpectedTargetPath");
    expect(packageSmoke).toContain(
      "Get-Item -LiteralPath $Shortcut.TargetPath",
    );
    expect(packageSmoke).toContain(
      "$QaTempRoot = (Get-Item -LiteralPath $env:TEMP).FullName",
    );
    expect(packageSmoke).toContain(
      '$InstallRoot = Join-Path $QaTempRoot "ytm-tray-package-install"',
    );
    expect(packageSmoke).toContain("release.json");
    expect(packageSmoke).toContain("Read-FilePrefixBytes");
    expect(packageSmoke).toContain("[System.IO.File]::OpenRead");
    expect(packageSmoke).toContain("$QuietSetupLogPath");
    expect(packageSmoke).toContain(
      "post-install launch skipped for quiet setup",
    );
    expect(packageSmoke).toContain("launched installed YTM Tray process");
    expect(packageSmoke).toContain("Assert-NoInstalledTrayProcess");
    expect(packageSmoke).toContain('"--launch-after-install"');
    expect(packageSmoke).toContain("Assert-PathMissing $InstallRoot");
    expect(packageSmoke).toContain("Assert-PathMissing $UninstallRegistryKey");
    expect(packageSmoke).toContain(
      'Assert-PathMissing (Join-Path $StartMenuFolder "YTM Tray.lnk")',
    );
    expect(packageSmoke).not.toContain("-Encoding Byte");
    expect(packageSmokeShell).toContain(
      "scripts\\windows-qa\\tray-package-smoke.ps1",
    );
  });

  it("automates Windows tray published release install, update, and uninstall", () => {
    const releaseE2e = read("scripts/windows-qa/tray-release-e2e.ps1");
    const releaseE2eShell = read(
      "scripts/remote/windows-qa/tray-release-e2e.sh",
    );

    expect(releaseE2e).toContain(
      "[Parameter(Mandatory = $true)][string] $BaselineVersion",
    );
    expect(releaseE2e).toContain(
      "[Parameter(Mandatory = $true)][string] $TargetVersion",
    );
    expect(releaseE2e).toContain("Invoke-WebRequest");
    expect(releaseE2e).toContain("YTM-Tray-update.json");
    expect(releaseE2e).toContain("[Security.Cryptography.SHA256]::Create()");
    expect(releaseE2e).not.toContain("Get-FileHash");
    expect(releaseE2e).toContain("Expand-Archive");
    expect(releaseE2e).toContain("Install-ReleasePackage");
    expect(releaseE2e).toContain("Assert-AuthenticodeSigner");
    expect(releaseE2e).toContain("Get-AuthenticodeSignature");
    expect(releaseE2e).toContain(
      "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts",
    );
    expect(releaseE2e).toContain(
      "HKCU:\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
    );
    expect(releaseE2e).toContain(
      "HKCU:\\Software\\Mozilla\\NativeMessagingHosts",
    );
    expect(releaseE2e).toContain("Invoke-InstalledUninstaller");
    expect(releaseE2e).toContain("Assert-Uninstalled");
    expect(releaseE2eShell).toContain(
      "scripts\\windows-qa\\tray-release-e2e.ps1",
    );
  });

  it("automates Windows tray live-update UI smoke", () => {
    const liveUpdateSmoke = read(
      "scripts/windows-qa/tray-live-update-smoke.ps1",
    );
    const liveUpdateSmokeShell = read(
      "scripts/remote/windows-qa/tray-live-update-smoke.sh",
    );
    const docs = read("docs/remote-qa.md");

    expect(liveUpdateSmoke).toContain(
      "[Parameter(Mandatory = $true)][string] $BaselineVersion",
    );
    expect(liveUpdateSmoke).toContain(
      "[Parameter(Mandatory = $true)][string] $TargetVersion",
    );
    expect(liveUpdateSmoke).toContain(
      'Join-Path $env:LOCALAPPDATA "YTM Enhancer\\Tray"',
    );
    expect(liveUpdateSmoke).toContain("ui-agent-client.ps1");
    expect(liveUpdateSmoke).toContain("Wait-WindowsQaUiAgentReady");
    expect(liveUpdateSmoke).toContain("Invoke-InteractivePowerShell");
    expect(liveUpdateSmoke).toContain(
      "UIAutomationClientsideProviders.UIAutomationClientSideProviders",
    );
    expect(liveUpdateSmoke).toContain(
      "ClientSettings]::RegisterClientSideProviderAssembly",
    );
    expect(liveUpdateSmoke).toContain("UiReadyTimeoutSeconds");
    expect(liveUpdateSmoke).not.toContain("New-ScheduledTaskPrincipal");
    expect(liveUpdateSmoke).toContain("Start-ReleasedTrayApp");
    expect(liveUpdateSmoke).toContain("Open-TrayPopup");
    expect(liveUpdateSmoke).toContain("Open-TrayContextMenu");
    expect(liveUpdateSmoke).toContain("GetClickablePoint");
    expect(liveUpdateSmoke).toContain("Invoke-Element");
    expect(liveUpdateSmoke).toContain("SendKeys");
    expect(liveUpdateSmoke).toContain("About YTM Tray - Update Available");
    expect(liveUpdateSmoke).toContain("About YTM Tray");
    expect(liveUpdateSmoke).toContain("$ExpectAboutOnlyUpdateUi");
    expect(liveUpdateSmoke).toContain(
      "Target popup still exposes a standalone update action.",
    );
    expect(liveUpdateSmoke).toContain(
      "Target context menu still exposes a standalone update action.",
    );
    expect(liveUpdateSmoke).toContain(
      "Target About window did not expose its update action.",
    );
    expect(liveUpdateSmoke).toContain(
      '$UpdateElement = Wait-ElementByName $PopupWindow "Install Update $TargetVersion" 60000',
    );
    expect(liveUpdateSmoke).toContain('$ActionSurface = "Popup"');
    expect(liveUpdateSmoke).not.toContain('$ActionSurface = "Root"');
    expect(liveUpdateSmoke).not.toContain('$ActionSurface = "ContextMenu"');
    expect(liveUpdateSmoke).toContain(
      '$ExpectAboutOnlyUpdateUi = [version]$ComparableTargetVersion -ge [version]"0.1.11"',
    );
    expect(liveUpdateSmoke).toContain("Check for Updates");
    expect(liveUpdateSmoke).toContain("Wait-DialogButton");
    expect(liveUpdateSmoke).toContain("Update YTM Tray");
    expect(liveUpdateSmoke).toContain(
      "if (-not (Invoke-Element $UpdateElement)) {",
    );
    expect(liveUpdateSmoke).toContain('$ActionActivation = "invoke"');
    expect(liveUpdateSmoke).toContain('$ActionActivation = "click"');
    expect(liveUpdateSmoke).toContain("actionActivation");
    expect(liveUpdateSmoke).toContain("-TimeoutSeconds 480");
    expect(liveUpdateSmoke).toContain("$ExpectedSessionId");
    expect(liveUpdateSmoke).toContain("trayProcessId");
    expect(liveUpdateSmoke).toContain("trayProcessSessionId");
    expect(liveUpdateSmoke).toContain("trayStartLogCount");
    expect(liveUpdateSmoke).toContain("bridgeStartLogCount");
    expect(liveUpdateSmoke).toContain("runnerScripts");
    expect(liveUpdateSmoke).toContain("$SmokePassed");
    expect(liveUpdateSmoke).toContain(
      "Retained Windows tray live-update smoke artifacts",
    );
    expect(liveUpdateSmoke).toContain("Wait-InstalledRelease");
    expect(liveUpdateSmoke).toContain("actionSurface");
    expect(liveUpdateSmoke).toContain("Assert-AuthenticodeSigner");
    expect(liveUpdateSmoke).toContain("Invoke-InstalledUninstaller");
    expect(liveUpdateSmoke).toContain("Assert-Uninstalled");
    expect(liveUpdateSmokeShell).toContain(
      "scripts\\windows-qa\\tray-live-update-smoke.ps1",
    );
    expect(liveUpdateSmokeShell).toContain("YTM_WINDOWS_TRAY_BASELINE_VERSION");
    expect(liveUpdateSmokeShell).toContain("YTM_WINDOWS_TRAY_TARGET_VERSION");
    expect(liveUpdateSmokeShell).toContain(
      "YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS",
    );
    expect(liveUpdateSmokeShell).toContain("-BaselineVersion");
    expect(liveUpdateSmokeShell).toContain("-TargetVersion");
    expect(liveUpdateSmokeShell).toContain("-UiReadyTimeoutSeconds");
    expect(docs).toContain("-BaselineVersion <baseline-version>");
    expect(docs).toContain("-TargetVersion <target-version>");
    expect(docs).toContain("<baseline-version> <target-version>");
  });

  it("installs a published Windows tray build for operational QA", () => {
    const operationalSmoke = read(
      "scripts/windows-qa/tray-operational-smoke.ps1",
    );
    const operationalSmokeShell = read(
      "scripts/remote/windows-qa/tray-operational-smoke.sh",
    );
    const docs = read("docs/remote-qa.md");

    expect(operationalSmoke).toContain("Wait-WindowsQaUiAgentReady");
    expect(operationalSmoke).toContain("Invoke-InteractivePowerShell");
    expect(operationalSmoke).toContain("Get-AuthenticodeSignature");
    expect(operationalSmoke).toContain("YTM-Tray-$ResolvedVersion-Setup.exe");
    expect(operationalSmoke).not.toContain("Expand-ReleasePackage");
    expect(operationalSmoke).toContain("Google Chrome");
    expect(operationalSmoke).toContain("Left YTM Tray installed");
    expect(operationalSmoke).toContain(
      "$LaunchBodyLines += $ChromeLaunchLines",
    );
    expect(operationalSmoke).toContain(
      'Join-Path $env:LOCALAPPDATA "YTM Enhancer\\Tray"',
    );
    expect(operationalSmokeShell).toContain(
      "scripts\\windows-qa\\tray-operational-smoke.ps1",
    );
    expect(operationalSmokeShell).toContain(
      "YTM_WINDOWS_TRAY_OPERATIONAL_PLAYBACK_URL",
    );
    expect(operationalSmokeShell).toContain(
      "YTM_WINDOWS_TRAY_OPERATIONAL_SKIP_CHROME",
    );
    expect(docs).toContain(
      "scripts/remote/windows-qa/tray-operational-smoke.sh",
    );
    expect(docs).toMatch(/does\s+not\s+uninstall or quit the tray app/);
  });

  it("validates the public Windows tray installer under Smart App Control", () => {
    const sacSmoke = read("scripts/windows-qa/tray-sac-smoke.ps1");
    const sacSmokeShell = read("scripts/remote/windows-qa/tray-sac-smoke.sh");
    const uiAgentClient = read("scripts/windows-qa/ui-agent-client.ps1");
    const docs = read("docs/remote-qa.md");
    const interactiveInstall = sacSmoke.slice(
      sacSmoke.indexOf("function Invoke-InteractiveInstallThroughUiAgent"),
      sacSmoke.indexOf("function Invoke-InstalledRuntimeThroughUiAgent"),
    );

    expect(sacSmoke).toContain("VerifiedAndReputablePolicyState");
    expect(sacSmoke).toContain("ZoneId=3");
    expect(sacSmoke).toContain("Get-AuthenticodeSignature");
    expect(sacSmoke).toContain("[string] $InstallerPath");
    expect(sacSmoke).toContain("YTM-Tray-");
    expect(sacSmoke).toContain("-Setup.exe");
    expect(sacSmoke).not.toContain("Expand-Archive");
    expect(sacSmoke).toContain("Wait-WindowsQaUiAgentReady");
    expect(sacSmoke).toContain("Invoke-InteractivePowerShell");
    expect(sacSmoke).toContain("-FilePath $SetupPath");
    expect(sacSmoke).toContain("-Wait");
    expect(sacSmoke).toContain("$Process.ExitCode");
    expect(sacSmoke).toContain("Invoke-InstalledRuntimeThroughUiAgent");
    expect(sacSmoke).toContain("Invoke-InteractiveInstallThroughUiAgent");
    expect(interactiveInstall).toContain(
      "YTM Tray was installed successfully.",
    );
    expect(interactiveInstall).toContain("PrematureTray");
    expect(interactiveInstall).toContain(
      "$DialogElementCollection.Item($ElementIndex)",
    );
    expect(interactiveInstall).not.toContain("$ButtonCondition");
    expect(interactiveInstall).not.toContain("InvokePattern");
    expect(interactiveInstall).toContain("Invoke-WindowsQaDialogOk");
    expect(interactiveInstall).toContain("$Dialog.Current.NativeWindowHandle");
    expect(interactiveInstall).toContain("-ButtonHandle $OkButtonWindowHandle");
    expect(interactiveInstall).toContain("$UiDiagnosticsPath");
    expect(interactiveInstall.indexOf("if (-not $WasSuccessful)")).toBeLessThan(
      interactiveInstall.indexOf("Invoke-WindowsQaDialogOk"),
    );
    expect(uiAgentClient).toContain("$DialogResultOk = 1");
    expect(uiAgentClient).toContain("[BitConverter]::ToUInt32");
    expect(uiAgentClient).toContain(
      "The Windows QA dialog handle is not a valid window.",
    );
    expect(uiAgentClient).toContain("GetDlgItem(");
    expect(uiAgentClient).toContain("$ButtonClickMessage = 0x00F5");
    expect(uiAgentClient).toContain("SetActiveWindow(");
    expect(uiAgentClient).toContain("PostMessage(");
    expect(uiAgentClient).toContain("$DialogCloseDeadline");
    expect(uiAgentClient).not.toContain("SendMessage(");
    expect(uiAgentClient).not.toContain("EndDialog(");
    expect(uiAgentClient).not.toContain("GetParent(");
    expect(uiAgentClient).toContain(
      "The Windows QA dialog remained open after its OK button was invoked.",
    );
    expect(interactiveInstall).toContain("-FilePath taskkill.exe");
    expect(interactiveInstall).toContain("WaitForExit(5000)");
    expect(interactiveInstall).not.toContain("--quiet");
    expect(interactiveInstall).not.toContain("--launch-after-install");
    expect(sacSmoke).toContain("Installer did not launch the installed");
    expect(sacSmoke).not.toContain(
      "Start-Process -FilePath $TrayPath -PassThru",
    );
    expect(sacSmoke).toContain("RedirectStandardInput = $true");
    expect(sacSmoke).toContain("bridge server accepted native host");
    expect(sacSmoke).toContain("native messaging relay starting");
    expect(sacSmoke).toContain("YTMTray(?:\\.NativeHost|\\.Setup)?(?:\\.exe)?");
    expect(sacSmoke).toContain("Microsoft-Windows-CodeIntegrity/Operational");
    expect(sacSmoke).toContain("Microsoft-Windows-AppLocker/MSI and Script");
    expect(sacSmoke).toContain('".cmd", ".ps1"');
    expect(sacSmokeShell).toContain("-InstallerPath");
    expect(sacSmokeShell).toContain("scripts\\windows-qa\\tray-sac-smoke.ps1");
    expect(docs).toContain("scripts/remote/windows-qa/tray-sac-smoke.sh");
    expect(docs).toContain("windows-tray-signed-candidate");
    expect(docs).toContain("Smart App Control enforcement");
    expect(docs).toMatch(/setup\s+then launched the installed tray/);
    expect(docs).toContain("starts the native host");
  });

  it("automates Windows tray release signing smoke with a disposable certificate", () => {
    const signingSmoke = read("scripts/windows-qa/tray-signing-smoke.ps1");
    const signingSmokeShell = read(
      "scripts/remote/windows-qa/tray-signing-smoke.sh",
    );

    expect(signingSmoke).toContain("New-SelfSignedCertificate");
    expect(signingSmoke).toContain("Test-SignToolAvailable");
    expect(signingSmoke).toContain("signtool.exe");
    expect(signingSmoke).toContain("CodeSigningCert");
    expect(signingSmoke).toContain("Export-PfxCertificate");
    expect(signingSmoke).toContain("YTM_WINDOWS_TRAY_CODESIGN_REQUIRED");
    expect(signingSmoke).toContain(
      "YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH",
    );
    expect(signingSmoke).toContain(
      "YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PASSWORD",
    );
    expect(signingSmoke).toContain("YTM_WINDOWS_TRAY_CODESIGN_TIMESTAMP_URL");
    expect(signingSmoke).toContain("Assert-SignedFile");
    expect(signingSmoke).toContain("Get-AuthenticodeSignature");
    expect(signingSmoke).toContain("windows-tray:installer");
    expect(signingSmoke).toContain("YTM-Tray-$($Metadata.version)-Setup.exe");
    expect(signingSmoke).toContain("Remove-CertificateByThumbprint");
    expect(signingSmokeShell).toContain(
      "scripts\\windows-qa\\tray-signing-smoke.ps1",
    );
  });

  it("automates Windows tray button smoke against Edge and Firefox fixtures", () => {
    const buttonSmoke = read("scripts/windows-qa/tray-button-smoke.ps1");
    const buttonSmokeShell = read(
      "scripts/remote/windows-qa/tray-button-smoke.sh",
    );
    const trayE2e = read("tests/e2e/windows-tray-connector.spec.ts");

    expect(buttonSmoke).toContain('$env:YTME_E2E_WINDOWS_TRAY = "1"');
    expect(buttonSmoke).toContain("playwright install firefox");
    expect(buttonSmoke).toContain("Invoke-Pnpm run dev:build:edge");
    expect(buttonSmoke).toContain("Invoke-Pnpm run dev:build:firefox");
    expect(buttonSmoke).toContain(
      "playwright test tests/e2e/windows-tray-connector.spec.ts --project=edge --project=firefox --workers=1",
    );
    expect(trayE2e).toContain("schtasks.exe");
    expect(trayE2e).toContain("logged into an unlocked desktop session");
    expect(buttonSmokeShell).toContain(
      "scripts\\windows-qa\\tray-button-smoke.ps1",
    );
    expect(trayE2e).toContain("UIAutomationClient");
    expect(trayE2e).toContain("Playback progress");
    expect(trayE2e).toContain("Focus YouTube Music");
    expect(trayE2e).toContain("Open YouTube Music");
    expect(trayE2e).toContain("YTM_TRAY_LOG_PATH");
    expect(trayE2e).toContain("requestId=focus-");
    expect(trayE2e).toContain("Microsoft Edge and Firefox");
  });

  it("automates Windows tray browser contention smoke against Firefox", () => {
    const contentionSmoke = read(
      "scripts/windows-qa/tray-contention-smoke.ps1",
    );
    const contentionSmokeShell = read(
      "scripts/remote/windows-qa/tray-contention-smoke.sh",
    );
    const contentionE2e = read("tests/e2e/windows-tray-contention.spec.ts");

    expect(contentionSmoke).toContain(
      '$env:YTME_E2E_WINDOWS_TRAY_CONTENTION = "1"',
    );
    expect(contentionSmoke).toContain(
      "YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL",
    );
    expect(contentionSmoke).toContain("[switch] $PreflightOnly");
    expect(contentionSmoke).toContain("Assert-RepoRoot");
    expect(contentionSmoke).toContain("Assert-ActiveBrowserOwner");
    expect(contentionSmoke).toContain("Assert-FirefoxNativeHostRegistered");
    expect(contentionSmoke).toContain("Write-PreflightSummary");
    expect(contentionSmoke).toContain("Write-StatusLine");
    expect(contentionSmoke).toContain("[Console]::Out.WriteLine");
    expect(contentionSmoke).not.toContain("Write-Host");
    expect(contentionSmoke).toContain("YTM Tray contention preflight passed.");
    expect(contentionSmoke).toContain("playwright install firefox");
    expect(contentionSmoke).toContain("Invoke-Pnpm run dev:build:firefox");
    expect(contentionSmoke).toContain(
      '$EdgeOutputPath = Join-Path $env:TEMP "ytme-own-$RunId"',
    );
    expect(contentionSmoke).toContain(
      '$FirefoxOutputPath = Join-Path $env:TEMP "ytme-con-$RunId"',
    );
    expect(contentionSmoke).toContain("--output $EdgeOutputLiteral");
    expect(contentionSmoke).toContain("--output $FirefoxOutputPath");
    expect(contentionSmoke).toContain("$EdgeProcess.WaitForExit(240000)");
    expect(contentionSmoke).toContain("$EdgeExitCodePath");
    expect(contentionSmoke).toContain(
      "[IO.File]::WriteAllText($EdgeExitCodeLiteral",
    );
    expect(contentionSmoke).toContain("[int]::TryParse");
    expect(contentionSmoke).not.toContain("Wait-Process -Id $EdgeProcess.Id");
    expect(contentionSmoke).toContain(
      "playwright test tests/e2e/windows-tray-contention.spec.ts --project=firefox --workers=1",
    );
    expect(contentionSmokeShell).toContain("--preserve-apps");
    expect(contentionSmokeShell).toContain("ps_quote");
    expect(contentionSmokeShell).toContain("-ExpectedOwner");
    expect(contentionSmokeShell).toContain(
      "YTME_WINDOWS_TRAY_CONTENTION_PREFLIGHT_ONLY",
    );
    expect(contentionSmokeShell).toContain(
      "scripts\\windows-qa\\tray-contention-smoke.ps1",
    );
    expect(contentionE2e).toContain("YTME_E2E_WINDOWS_TRAY_CONTENTION");
    expect(contentionE2e).toContain("YTM Tray is already connected to");
    expect(contentionE2e).toContain("Already Connected");
    expect(contentionE2e).toContain("Retry Tray");
    expect(contentionE2e).toContain('testInfo.project.name !== "firefox"');
  });
});
