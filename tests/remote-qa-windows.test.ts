import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("Windows remote QA scaffold", () => {
  it("documents the bowfin Windows VM path and environment", () => {
    const docs = read("docs/remote-qa.md");

    expect(docs).toContain("## Windows On Bowfin");
    expect(docs).toContain("Windows 11 ARM VM");
    expect(docs).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(docs).toContain("REMOTE_QA_WINDOWS_WORK_ROOT");
    expect(docs).toContain("Windows CLI native messaging QA is not wired yet");
    expect(docs).toContain("scripts/windows-qa/check.ps1");
    expect(docs).toContain("scripts/windows-qa/e2e-edge-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-package-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-visual-smoke.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-release-screenshot.ps1");
    expect(docs).toContain("scripts/windows-qa/tray-button-smoke.ps1");
    expect(docs).toContain("scripts/remote/windows-qa/probe.sh");
    expect(docs).toContain("scripts/remote/windows-qa/tray-smoke.sh");
    expect(docs).toContain("scripts/remote/windows-qa/tray-package-smoke.sh");
    expect(docs).toContain("scripts/remote/windows-qa/tray-visual-smoke.sh");
    expect(docs).toContain(
      "scripts/remote/windows-qa/tray-release-screenshot.sh",
    );
    expect(docs).toContain("scripts/remote/windows-qa/tray-button-smoke.sh");
    expect(docs).toContain("Connection timed out during banner exchange");
    expect(docs).toContain("OpenSSH-Server-In-TCP");
    expect(docs).toContain("Microsoft.DotNet.SDK.10");
    expect(docs).toMatch(
      /the tray\s+connector button smoke covers Edge and Firefox/,
    );
  });

  it("provides a no-sync Windows SSH preflight", () => {
    const probe = read("scripts/remote/windows-qa/probe.sh");

    expect(probe).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(probe).toContain("REMOTE_QA_WINDOWS_USER");
    expect(probe).toContain("nc -vz");
    expect(probe).toContain("powershell.exe -NoProfile -Command");
    expect(probe).not.toContain("tar -czf");
  });

  it("bridges through the macOS Crabbox runner into Windows OpenSSH", () => {
    const runner = read("scripts/remote/windows-qa/crabbox-run.sh");

    expect(runner).toContain(
      'macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"',
    );
    expect(runner).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(runner).toContain("powershell.exe");
    expect(runner).toContain("-EncodedCommand");
    expect(runner).toContain("function Remove-QaTree");
    expect(runner).toContain("Get-Process msedge, firefox, YTMTray");
    expect(runner).toContain("[System.IO.Directory]::Delete");
    expect(runner).toContain("COPYFILE_DISABLE=1 tar -czf -");
    expect(runner).toContain("tar -xzf - -C \\$target");
  });

  it("uses Windows-native checks instead of the POSIX check script", () => {
    const check = read("scripts/windows-qa/check.ps1");
    const checkShell = read("scripts/remote/windows-qa/check.sh");

    expect(check).toContain("Invoke-Native pnpm run format:check");
    expect(check).toContain("Invoke-Native pnpm run lint");
    expect(check).toContain("Invoke-Native go -C apps/cli test ./...");
    expect(check).toContain("Invoke-Native pnpm run dev:build:edge");
    expect(check).not.toContain("pnpm run check");
    expect(checkShell).toContain("scripts\\windows-qa\\check.ps1");
  });

  it("keeps Windows browser e2e scoped to Edge", () => {
    const e2e = read("scripts/windows-qa/e2e-edge-smoke.ps1");
    const e2eShell = read("scripts/remote/windows-qa/e2e-edge-smoke.sh");

    expect(e2e).toContain("Invoke-Native pnpm run dev:build:edge");
    expect(e2e).toContain("playwright test tests/e2e --project=edge");
    expect(e2eShell).toContain("scripts\\windows-qa\\e2e-edge-smoke.ps1");
  });

  it("automates Windows tray visual smoke through the active desktop", () => {
    const visualSmoke = read("scripts/windows-qa/tray-visual-smoke.ps1");
    const visualSmokeShell = read(
      "scripts/remote/windows-qa/tray-visual-smoke.sh",
    );

    expect(visualSmoke).toContain("New-ScheduledTaskPrincipal");
    expect(visualSmoke).toContain("-LogonType Interactive");
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
  });

  it("captures the release screenshot through the real tray connector smoke", () => {
    const releaseScreenshot = read(
      "scripts/windows-qa/tray-release-screenshot.ps1",
    );
    const releaseScreenshotShell = read(
      "scripts/remote/windows-qa/tray-release-screenshot.sh",
    );
    const trayE2e = read("tests/e2e/windows-tray-connector.spec.ts");

    expect(releaseScreenshot).toContain(
      "$env:YTME_WINDOWS_TRAY_SCREENSHOT_PATH",
    );
    expect(releaseScreenshot).toContain("pnpm run dev:build:edge");
    expect(releaseScreenshot).toContain(
      "tests/e2e/windows-tray-connector.spec.ts",
    );
    expect(releaseScreenshot).toContain("--project=edge");
    expect(releaseScreenshotShell).toContain(
      "scripts\\windows-qa\\tray-release-screenshot.ps1",
    );
    expect(releaseScreenshotShell).toContain("YTME_SCREENSHOT_BASE64_BEGIN");
    expect(releaseScreenshotShell).toContain("base64 --decode");
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
    const packageSmokeShell = read(
      "scripts/remote/windows-qa/tray-package-smoke.sh",
    );

    expect(packageSmoke).toContain("windows-tray:package:$RuntimeIdentifier");
    expect(packageSmoke).toContain("windows-tray:update-manifest");
    expect(packageSmoke).toContain("--package=$ArchivePath");
    expect(packageSmoke).toContain("YTM-Tray-update.json");
    expect(packageSmoke).toContain("Expand-Archive");
    expect(packageSmoke).toContain("install-native-hosts.ps1");
    expect(packageSmoke).toContain("release.json");
    expect(packageSmoke).toContain("Read-FilePrefixBytes");
    expect(packageSmoke).toContain("[System.IO.File]::OpenRead");
    expect(packageSmoke).not.toContain("-Encoding Byte");
    expect(packageSmokeShell).toContain(
      "scripts\\windows-qa\\tray-package-smoke.ps1",
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
    expect(buttonSmoke).toContain("pnpm run dev:build:edge");
    expect(buttonSmoke).toContain("pnpm run dev:build:firefox");
    expect(buttonSmoke).toContain(
      "playwright test tests/e2e/windows-tray-connector.spec.ts --project=edge --project=firefox --workers=1",
    );
    expect(buttonSmokeShell).toContain(
      "scripts\\windows-qa\\tray-button-smoke.ps1",
    );
    expect(trayE2e).toContain("UIAutomationClient");
    expect(trayE2e).toContain("Playback progress");
    expect(trayE2e).toContain("Focus YouTube Music");
    expect(trayE2e).toContain("YTM_TRAY_LOG_PATH");
    expect(trayE2e).toContain("requestId=focus-");
    expect(trayE2e).toContain("Microsoft Edge and Firefox");
  });
});
