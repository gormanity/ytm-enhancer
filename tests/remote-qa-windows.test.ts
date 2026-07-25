import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("Windows remote QA scaffold", () => {
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
    expect(docs).toContain("OpenSSH-Server-In-TCP");
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
    expect(probe).toContain("nc -vz -w 10");
    expect(probe).toContain(
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand",
    );
    expect(probe).toContain("REMOTE_QA_CONFIG=/dev/null");
    expect(probe).toContain("scripts/remote/windows-qa/probe.sh");
    expect(probe).not.toContain("tar -czf");
  });

  it("provides a user-session Windows UI QA agent probe", () => {
    const common = read("scripts/windows-qa/ui-agent-common.ps1");
    const helper = read("scripts/windows-qa/ui-agent-client.ps1");
    const installer = read("scripts/windows-qa/install-ui-agent.ps1");
    const agent = read("scripts/windows-qa/start-ui-agent.ps1");
    const restarter = read("scripts/windows-qa/restart-ui-agent.ps1");
    const client = read("scripts/windows-qa/invoke-ui-agent.ps1");

    expect(common).toContain("function Get-WindowsQaAgentPipeName");
    expect(common).toContain("WindowsIdentity");
    expect(agent).toContain("NamedPipeServerStream");
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
    expect(agent).toContain('WindowStyle = "Hidden"');
    expect(agent).toContain("processStillRunning");
    expect(agent).not.toContain("Register-ScheduledTask");
    expect(helper).toContain("Get-WindowsQaUiAgentReadiness");
    expect(helper).toContain("Assert-WindowsQaUiAgentReady");
    expect(helper).toContain("Wait-WindowsQaUiAgentReady");
    expect(helper).toContain("Unlock the Windows QA desktop session");
    expect(helper).toContain("Invoke-InteractivePowerShell");
    expect(helper).toContain("invoke-ui-agent.ps1");
    expect(installer).toContain("YTM Enhancer\\WindowsQaAgent");
    expect(installer).toContain("start-ui-agent.cmd");
    expect(installer).toContain("restart-ui-agent.ps1");
    expect(installer).toContain("Copy-Item");
    expect(restarter).toContain("not SSH/session 0");
    expect(restarter).toContain("-Action Shutdown");
    expect(restarter).toContain("-WindowStyle Hidden");
    expect(restarter).toContain("start-ui-agent.ps1");
    expect(client).toContain("NamedPipeClientStream");
    expect(client).toContain("Cannot connect to Windows QA UI agent");
    expect(client).toContain("LaunchProbe");
    expect(client).not.toContain("LaunchNotepad");
    expect(client).not.toContain("Register-ScheduledTask");
  });

  it("provides a clickable Windows OpenSSH repair helper", () => {
    const launcher = read("scripts/windows-qa/repair-openssh.cmd");
    const repair = read("scripts/windows-qa/repair-openssh.ps1");

    expect(launcher).toContain("repair-openssh.ps1");
    expect(launcher).toContain("-PauseOnExit");
    expect(repair).toContain("Test-IsAdministrator");
    expect(repair).toContain("Start-Process");
    expect(repair).toContain("OpenSSH.Server~~~~0.0.1.0");
    expect(repair).toContain("ssh-keygen.exe -A");
    expect(repair).toContain("Set-Service sshd -StartupType Automatic");
    expect(repair).toContain("Restart-Service sshd -Force");
    expect(repair).toContain("OpenSSH-Server-In-TCP");
    expect(repair).toContain("administrators_authorized_keys");
    expect(repair).toContain("Test-NetConnection 127.0.0.1 -Port 22");
    expect(repair).toContain("YTM-Windows-QA-SSH-Repair.log");
  });

  it("runs Windows QA directly or through a macOS intermediary", () => {
    const runner = read("scripts/remote/windows-qa/run.sh");
    const crabboxRunner = read("scripts/remote/windows-qa/crabbox-run.sh");

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
    expect(runner).toContain('sync_cleanup_script=""');
    expect(runner).toContain("REMOTE_QA_CONFIG=/dev/null");
    expect(runner).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(runner).toContain("REMOTE_QA_WINDOWS_PNPM_NODE_LINKER");
    expect(runner).toContain("PNPM_CONFIG_NODE_LINKER");
    expect(runner).toContain("PNPM_CONFIG_PACKAGE_IMPORT_METHOD");
    expect(runner).toContain("powershell.exe");
    expect(runner).toContain("-EncodedCommand");
    expect(runner).toContain("function Remove-QaTree");
    expect(runner).toContain("Get-Process chrome, msedge, firefox, YTMTray");
    expect(runner).toContain("[System.IO.Directory]::Delete");
    expect(runner).toContain("$RemainingItems.Count -eq 0");
    expect(runner).toContain("COPYFILE_DISABLE=1 tar -czf -");
    expect(runner).toContain("--exclude CLAUDE.md");
    expect(runner).toContain("--exclude apps/menu-bar/.build");
    expect(runner).toContain("--exclude apps/windows-tray/.build");
    expect(runner).toContain("tar -xzf - -C \\$target");
    expect(crabboxRunner).toContain(
      'REMOTE_QA_WINDOWS_TRANSPORT="${REMOTE_QA_WINDOWS_TRANSPORT:-macos}"',
    );
    expect(crabboxRunner).toContain('exec "$script_dir/run.sh" "$@"');
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

    expect(releaseScreenshot).toContain(
      "$env:YTME_WINDOWS_TRAY_SCREENSHOT_PATH",
    );
    expect(releaseScreenshot).toContain(
      "$env:YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL",
    );
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

    expect(releaseE2e).toContain('$BaselineVersion = "0.0.2"');
    expect(releaseE2e).toContain('$TargetVersion = "0.1.0"');
    expect(releaseE2e).toContain("Invoke-WebRequest");
    expect(releaseE2e).toContain("YTM-Tray-update.json");
    expect(releaseE2e).toContain("Get-FileHash");
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

    expect(liveUpdateSmoke).toContain('$BaselineVersion = "0.0.2"');
    expect(liveUpdateSmoke).toContain('$TargetVersion = "0.1.0"');
    expect(liveUpdateSmoke).toContain(
      'Join-Path $env:LOCALAPPDATA "YTM Enhancer\\Tray"',
    );
    expect(liveUpdateSmoke).toContain("ui-agent-client.ps1");
    expect(liveUpdateSmoke).toContain("Wait-WindowsQaUiAgentReady");
    expect(liveUpdateSmoke).toContain("Invoke-InteractivePowerShell");
    expect(liveUpdateSmoke).toContain("UiReadyTimeoutSeconds");
    expect(liveUpdateSmoke).not.toContain("New-ScheduledTaskPrincipal");
    expect(liveUpdateSmoke).toContain("Start-ReleasedTrayApp");
    expect(liveUpdateSmoke).toContain("Open-TrayPopup");
    expect(liveUpdateSmoke).toContain("Open-TrayContextMenu");
    expect(liveUpdateSmoke).toContain("GetClickablePoint");
    expect(liveUpdateSmoke).toContain("Invoke-Element");
    expect(liveUpdateSmoke).toContain("SendKeys");
    expect(liveUpdateSmoke).toContain("popup root");
    expect(liveUpdateSmoke).toContain("Install Update $TargetVersion");
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
