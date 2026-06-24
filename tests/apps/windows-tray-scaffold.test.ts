import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(process.cwd(), "apps/windows-tray");

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), "utf-8");
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
});
