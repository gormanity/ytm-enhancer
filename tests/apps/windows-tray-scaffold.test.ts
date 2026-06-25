import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(process.cwd(), "apps/windows-tray");

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), "utf-8");
}

function readRepo(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf-8");
}

function toPosixPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function listFiles(dir: string): string[] {
  const absolute = resolve(appRoot, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    const relativePath = toPosixPath(relative(appRoot, path));
    return statSync(path).isDirectory()
      ? listFiles(relativePath)
      : relativePath;
  });
}

describe("Windows tray connector scaffold", () => {
  it("defines a modern .NET WinForms tray executable", () => {
    const project = read("src/YTMTray/YTMTray.csproj");
    const nativeHostProject = read(
      "src/YTMTray.NativeHost/YTMTray.NativeHost.csproj",
    );

    expect(project).toContain(
      "<TargetFramework>net10.0-windows</TargetFramework>",
    );
    expect(project).toContain("<UseWindowsForms>true</UseWindowsForms>");
    expect(project).toContain("<OutputType>WinExe</OutputType>");
    expect(project).not.toContain("net48");
    expect(nativeHostProject).toContain(
      "<TargetFramework>net10.0-windows</TargetFramework>",
    );
    expect(nativeHostProject).toContain("<OutputType>Exe</OutputType>");
    expect(nativeHostProject).toContain(
      "<AssemblyName>YTMTray.NativeHost</AssemblyName>",
    );
  });

  it("uses the connector protocol over native messaging stdio", () => {
    const sources = listFiles("src").map(read).join("\n");

    expect(sources).toContain(
      'public const string HostName = "com.gormanity.ytm_enhancer.tray"',
    );
    expect(sources).toContain(
      'public const string ConnectorId = "com.gormanity.ytm-enhancer.tray"',
    );
    expect(sources).toContain('"connector.hello"');
    expect(sources).toContain('"connector.subscribe"');
    expect(sources).toContain('"playback.getState"');
    expect(sources).toContain('"playback.action"');
    expect(sources).toContain('"playback.seek"');
    expect(sources).toContain('"ytm.focus"');
    expect(sources).toContain("Console.OpenStandardInput()");
    expect(sources).toContain("Console.OpenStandardOutput()");
    expect(sources).toContain("starting YTM Tray native host");
  });

  it("bridges browser-launched native hosts into a resident tray app", () => {
    const sources = listFiles("src").map(read).join("\n");

    expect(sources).toContain("NamedPipeServerStream");
    expect(sources).toContain("NamedPipeClientStream");
    expect(sources).toContain("BridgeUiConnection");
    expect(sources).toContain("RelayAsync");
    expect(sources).toContain("no resident tray bridge available");
  });

  it("keeps the playback popup clear of the hidden-icons flyout", () => {
    const trayController = read("src/YTMTray/TrayController.cs");

    expect(trayController).toContain("TaskbarFlyoutClearance = 112");
    expect(trayController).toContain(
      "workingArea.Bottom - popup.Height - TaskbarFlyoutClearance",
    );
    expect(trayController).toContain("popup.OnAbout = () => ShowAbout(popup)");
    expect(trayController).toContain("IWin32Window? owner");
    expect(trayController).toContain("MessageBox.Show(");
    expect(trayController).toContain("owner,");
  });

  it("uses a custom tray flyout instead of default dialog controls", () => {
    const popupForm = read("src/YTMTray/PlaybackPopupForm.cs");

    expect(popupForm).toContain("FormBorderStyle = FormBorderStyle.None");
    expect(popupForm).toContain('AccessibleName = "YTM Tray"');
    expect(popupForm).toContain("ArtworkBoxControl : Control");
    expect(popupForm).toContain("CloseButtonControl : Control");
    expect(popupForm).toContain("SeekBarControl : Control");
    expect(popupForm).toContain("PlaybackButtonControl : Control");
    expect(popupForm).toContain("PopupActionRowControl : Control");
    expect(popupForm).toContain("PlaybackButtonIcon.Shuffle");
    expect(popupForm).toContain("PlaybackButtonIcon.RepeatOne");
    expect(popupForm).toContain("PlaybackSvgIconRenderer.Draw");
    expect(popupForm).toContain("ControlStyles.OptimizedDoubleBuffer");
    expect(popupForm).toContain("LinearGradientBrush");
    expect(popupForm).toContain("UserSeekRequested");
    expect(popupForm).toContain('nextSectionLabel.Text = "Up Next"');
    expect(popupForm).toContain('"Focus YouTube Music"');
    expect(popupForm).toContain('"Check for Updates"');
    expect(popupForm).toContain("Install Update {version}");
    expect(popupForm).toContain('"About YTM Tray"');
    expect(popupForm).toContain("ToolTip controlTips");
    expect(popupForm).not.toContain("DrawShuffleIcon");
    expect(popupForm).not.toContain("DrawRepeatIcon");
    expect(popupForm).not.toContain("TrackBar progressBar");
    expect(popupForm).not.toContain("TickStyle.None");
  });

  it("embeds shared connector playback SVG assets", () => {
    const project = read("src/YTMTray/YTMTray.csproj");
    const renderer = read("src/YTMTray/PlaybackSvgIconRenderer.cs");

    expect(project).toContain(
      "packages\\connector-ui-assets\\playback\\playback-*.svg",
    );
    expect(project).toContain('Link="Resources\\%(Filename)%(Extension)"');
    expect(renderer).toContain("playback-shuffle");
    expect(renderer).toContain("playback-repeat-one");
    expect(renderer).toContain("SvgPathParser.Parse");
    expect(renderer).not.toContain("PackageReference");
  });

  it("has a populated visual QA fixture for tray screenshots", () => {
    const program = read("src/YTMTray/Program.cs");
    const visualSmoke = read(
      "../../scripts/remote/windows-qa/tray-visual-smoke.ps1",
    );

    expect(program).toContain('"YTM_TRAY_VISUAL_DEMO"');
    expect(program).toContain("DemoConnectorConnection : IConnectorConnection");
    expect(program).toContain('"A Walk"');
    expect(program).toContain('"Send And Receive (Chachi Jones Remix)"');
    expect(visualSmoke).toContain('$env:YTM_TRAY_VISUAL_DEMO = "1"');
    expect(visualSmoke).toContain("Save-RectangleScreenshot");
    expect(visualSmoke).toContain("$PopupWindow.Current.BoundingRectangle");
  });

  it("reopens the tray popup when button QA finds a hidden stale window", () => {
    const buttonSmoke = read("../../tests/e2e/windows-tray-connector.spec.ts");

    expect(buttonSmoke).toContain("function Test-VisibleWindow");
    expect(buttonSmoke).toContain("$Window.Current.IsOffscreen");
    expect(buttonSmoke).toContain(
      "$null -ne $PopupWindow -and (Test-VisibleWindow $PopupWindow)",
    );
  });

  it("installs Edge and Chrome native messaging registration under HKCU", () => {
    const installScript = read("scripts/install-native-hosts.ps1");
    const uninstallScript = read("scripts/uninstall-native-hosts.ps1");

    expect(installScript).toContain("HKCU:\\Software\\Google\\Chrome");
    expect(installScript).toContain("HKCU:\\Software\\Microsoft\\Edge");
    expect(installScript).toContain("function Invoke-Native");
    expect(installScript).toContain("AdditionalAllowedOrigins");
    expect(installScript).toContain("Normalize-AllowedOrigin");
    expect(installScript).toContain("chrome-extension://[a-p]{32}/");
    expect(installScript).toContain("Invoke-Native -FilePath dotnet");
    expect(installScript).toContain("YTMTray.NativeHost.exe");
    expect(installScript).toContain(
      '$HostName = "com.gormanity.ytm_enhancer.tray"',
    );
    expect(installScript).toContain(
      '$ManifestPath = Join-Path $InstallRoot "$HostName.json"',
    );
    expect(installScript).toContain("allowed_origins");
    expect(installScript).toContain("bilcedjabgiedoamakekncokccabdccp");
    expect(installScript).toContain("gamefnibdabclmkngggcjghpbhjmajkm");
    expect(uninstallScript).toContain("Remove-Item");
    expect(uninstallScript).toContain("YTMTray");
    expect(uninstallScript).toContain("YTMTray.NativeHost");
  });

  it("provides dependency-free .NET tray tests", () => {
    const testProject = read("tests/YTMTray.Tests/YTMTray.Tests.csproj");
    const testRunner = read("tests/YTMTray.Tests/Program.cs");

    expect(testProject).toContain("<TargetFramework>net10.0</TargetFramework>");
    expect(testProject).not.toContain("PackageReference");
    expect(testRunner).toContain("NativeMessagingCodecRoundTrip");
    expect(testRunner).toContain("ConnectorAppHandshake");
  });

  it("keeps release metadata separate from the browser extension version", () => {
    const metadata = JSON.parse(read("release/metadata.json")) as {
      appName: string;
      assetPrefix: string;
      githubReleaseTagPrefix: string;
      githubReleaseListUrl: string;
      installUrl: string;
      nativeHostName: string;
      runtimes: string[];
      version: string;
    };

    expect(metadata.appName).toBe("YTM Tray");
    expect(metadata.nativeHostName).toBe("com.gormanity.ytm_enhancer.tray");
    expect(metadata.version).toBe("0.1.0");
    expect(metadata.githubReleaseTagPrefix).toBe("windows-tray-v");
    expect(metadata.githubReleaseListUrl).toBe(
      "https://api.github.com/repos/gormanity/ytm-enhancer/releases",
    );
    expect(metadata.installUrl).toBe(
      "https://github.com/gormanity/ytm-enhancer/releases?q=windows-tray-v&expanded=true",
    );
    expect(metadata.assetPrefix).toBe("YTM-Tray");
    expect(metadata.runtimes).toEqual(["win-x64", "win-arm64"]);
  });

  it("packages prebuilt release zips without requiring the .NET SDK at install time", () => {
    const packageScript = read("scripts/package-release.mjs");
    const manifestScript = read("scripts/generate-update-manifest.mjs");
    const installScript = read("scripts/install-native-hosts.ps1");
    const signingScript = read("scripts/sign-release-payload.ps1");

    expect(packageScript).toContain("dotnet");
    expect(packageScript).toContain("/p:Version=${metadata.version}");
    expect(packageScript).toContain("/p:AssemblyVersion=");
    expect(packageScript).toContain(
      "YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH",
    );
    expect(packageScript).toContain("sign-release-payload.ps1");
    expect(packageScript).toContain("install-native-hosts.ps1");
    expect(packageScript).toContain("uninstall-native-hosts.ps1");
    expect(packageScript).toContain("release.json");
    expect(packageScript).toContain(
      "releaseListUrl: metadata.githubReleaseListUrl",
    );
    expect(packageScript).toContain(
      "updateManifestAssetName: `${metadata.assetPrefix}-update.json`",
    );
    expect(packageScript).toContain("tar");
    expect(packageScript).toContain("-a");
    expect(packageScript).toContain("pathToFileURL(process.argv[1]).href");
    expect(packageScript).toContain(
      "${metadata.assetPrefix}-${metadata.version}-${runtime}.zip",
    );

    expect(manifestScript).toContain("createHash");
    expect(manifestScript).toContain("sha256");
    expect(manifestScript).toContain("metadata.githubReleaseTagPrefix");
    expect(manifestScript).toContain("releaseListUrl");
    expect(manifestScript).toContain("minimumWindowsVersion");
    expect(manifestScript).toContain("pathToFileURL(process.argv[1]).href");

    expect(installScript).toContain("Test-PackagedBinaries");
    expect(installScript).toContain("Install-PackagedBinaries");
    expect(installScript).toContain(
      ".NET 10 SDK is required when installing from source.",
    );
    expect(installScript).toContain("use a release package");
    expect(installScript).toContain(
      "Copy-Item -LiteralPath $PackagedExecutablePath",
    );
    expect(installScript).toContain(
      "Copy-Item -LiteralPath $PackagedReleaseMetadataPath",
    );
    expect(installScript).toContain("Get-Process YTMTray, YTMTray.NativeHost");

    expect(signingScript).toContain("signtool.exe");
    expect(signingScript).toContain(
      "YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PASSWORD",
    );
    expect(signingScript).toContain("YTM_WINDOWS_TRAY_CODESIGN_TIMESTAMP_URL");
    expect(signingScript).toContain("YTMTray.exe");
    expect(signingScript).toContain("YTMTray.NativeHost.exe");
    expect(signingScript).toContain('"verify"');
  });

  it("generates a checksum update manifest for packaged Windows runtimes", async () => {
    const outputRoot = mkdtempSync(
      join(tmpdir(), "ytm-windows-tray-manifest-test-"),
    );
    const x64Package = join(outputRoot, "YTM-Tray-0.1.0-win-x64.zip");
    const armPackage = join(outputRoot, "YTM-Tray-0.1.0-win-arm64.zip");
    const outputPath = join(outputRoot, "YTM-Tray-update.json");
    const { writeFileSync } = await import("node:fs");
    const manifestModulePath = resolve(
      process.cwd(),
      "apps/windows-tray/scripts/generate-update-manifest.mjs",
    );
    const { generateUpdateManifest } = (await import(
      pathToFileURL(manifestModulePath).href
    )) as {
      generateUpdateManifest: (options: {
        outputPath: string;
        packagePaths: string[];
        releaseBaseUrl: string;
      }) => string;
    };

    writeFileSync(x64Package, "x64 package");
    writeFileSync(armPackage, "arm package");

    generateUpdateManifest({
      outputPath,
      packagePaths: [x64Package, armPackage],
      releaseBaseUrl: "https://example.test/download",
    });

    const manifest = JSON.parse(readFileSync(outputPath, "utf-8")) as {
      assets: Record<string, { name: string; sha256: string; url: string }>;
      installUrl: string;
      releaseListUrl: string;
      tag: string;
      version: string;
    };

    expect(manifest.version).toBe("0.1.0");
    expect(manifest.tag).toBe("windows-tray-v0.1.0");
    expect(manifest.releaseListUrl).toBe(
      "https://api.github.com/repos/gormanity/ytm-enhancer/releases",
    );
    expect(manifest.installUrl).toBe(
      "https://github.com/gormanity/ytm-enhancer/releases?q=windows-tray-v&expanded=true",
    );
    expect(manifest.assets["win-x64"]?.name).toBe("YTM-Tray-0.1.0-win-x64.zip");
    expect(manifest.assets["win-arm64"]?.name).toBe(
      "YTM-Tray-0.1.0-win-arm64.zip",
    );
    expect(manifest.assets["win-x64"]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.assets["win-x64"]?.url).toBe(
      "https://example.test/download/windows-tray-v0.1.0/YTM-Tray-0.1.0-win-x64.zip",
    );
  });

  it("wires package scripts for Windows tray releases", () => {
    const packageJson = JSON.parse(readRepo("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["windows-tray:package:win-x64"]).toBe(
      "node apps/windows-tray/scripts/package-release.mjs --runtime=win-x64",
    );
    expect(packageJson.scripts["windows-tray:package:win-arm64"]).toBe(
      "node apps/windows-tray/scripts/package-release.mjs --runtime=win-arm64",
    );
    expect(packageJson.scripts["windows-tray:update-manifest"]).toBe(
      "node apps/windows-tray/scripts/generate-update-manifest.mjs",
    );
  });

  it("reports the packaged assembly version through connector hello", () => {
    const protocol = read("src/YTMTray.Core/ConnectorProtocol.cs");
    const coreProject = read("src/YTMTray.Core/YTMTray.Core.csproj");

    expect(protocol).toContain("AssemblyInformationalVersionAttribute");
    expect(protocol).not.toContain('ConnectorVersion = "0.1.0"');
    expect(coreProject).toContain("<Version>0.1.0</Version>");
    expect(coreProject).toContain(
      "<InformationalVersion>0.1.0</InformationalVersion>",
    );
  });

  it("provides a checksum-verified Windows tray updater", () => {
    const updater = read("src/YTMTray.Core/WindowsTrayUpdateService.cs");
    const trayController = read("src/YTMTray/TrayController.cs");
    const popupForm = read("src/YTMTray/PlaybackPopupForm.cs");
    const appContext = read("src/YTMTray/TrayApplicationContext.cs");

    expect(updater).toContain("WindowsTrayUpdateService");
    expect(updater).toContain("ReleaseListUrl");
    expect(updater).toContain("YTM-Tray-update.json");
    expect(updater).toContain("RequireHttps");
    expect(updater).toContain("VerifyChecksum");
    expect(updater).toContain("ExtractZipSafely");
    expect(updater).toContain("unsafe package path");
    expect(updater).toContain('ProcessStartInfo("powershell.exe")');
    expect(updater).toContain("ArgumentList.Add");
    expect(updater).toContain("FromReleaseMetadataFile");

    expect(trayController).toContain("StartBackgroundUpdateCheck");
    expect(trayController).toContain("CheckForUpdatesAsync");
    expect(trayController).toContain("ShowBalloonTip");
    expect(trayController).toContain("DownloadAndPrepareUpdateAsync");
    expect(trayController).toContain("StartInstaller");
    expect(popupForm).toContain("OnCheckForUpdates");
    expect(appContext).toContain("trayController.StartBackgroundUpdateCheck()");
  });

  it("publishes component-scoped Windows tray releases", () => {
    const workflow = readRepo(".github/workflows/windows-tray-release.yml");
    const releaseDocs = readRepo("docs/windows-tray-release.md");
    const releaseStrategy = readRepo("docs/release-strategy.md");
    const connectorsDocs = readRepo("docs/connectors.md");

    expect(workflow).toContain("Windows Tray Release");
    expect(workflow).toContain("windows-tray-v*");
    expect(workflow).toContain("actions/setup-dotnet@v5");
    expect(workflow).toContain("dotnet-version: 10.0.x");
    expect(workflow).toContain("windows-tray:package:win-x64");
    expect(workflow).toContain("windows-tray:package:win-arm64");
    expect(workflow).toContain("windows-tray:update-manifest");
    expect(workflow).toContain("WINDOWS_TRAY_CODESIGN_PFX_BASE64");
    expect(workflow).toContain("WINDOWS_TRAY_CODESIGN_PASSWORD");
    expect(workflow).toContain("YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH");
    expect(workflow).toContain("make_latest: false");
    expect(workflow).toContain("apps/windows-tray/.build/packages/*.zip");
    expect(workflow).toContain(
      "apps/windows-tray/.build/update-manifest/*.json",
    );

    expect(releaseDocs).toContain("windows-tray-vX.Y.Z");
    expect(releaseDocs).toContain("YTM-Tray-<version>-win-x64.zip");
    expect(releaseDocs).toContain("YTM-Tray-update.json");
    expect(releaseDocs).toContain("scripts/remote/windows-qa/tray-smoke.sh");
    expect(releaseDocs).toContain(
      "scripts/remote/windows-qa/tray-button-smoke.sh",
    );
    expect(releaseDocs).toContain("component release that does not replace");
    expect(releaseDocs).toContain("Checksum-Verified In-App Updates");
    expect(releaseDocs).toContain("Check for Updates");
    expect(releaseDocs).toContain("WINDOWS_TRAY_CODESIGN_PFX_BASE64");
    expect(releaseDocs).toContain("signed `YTMTray.exe`");

    expect(releaseStrategy).toContain("YTM Tray:");
    expect(releaseStrategy).toContain("windows-tray-vX.Y.Z");
    expect(releaseStrategy).toContain(
      ".github/workflows/windows-tray-release.yml",
    );
    expect(connectorsDocs).toContain("com.gormanity.ytm_enhancer.tray");
    expect(connectorsDocs).toContain("verify the runtime package checksum");
  });
});
