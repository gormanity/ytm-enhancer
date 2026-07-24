# YTM Tray

YTM Tray is the Windows first-party Connected App for YTM Enhancer. It is a
native tray app that communicates with the browser extension through native
messaging and exposes playback status and controls from the Windows notification
area.

## Local Development

Install the .NET 10 SDK in the Windows environment, then run:

```powershell
dotnet run --project .\tests\YTMTray.Tests\YTMTray.Tests.csproj
.\scripts\install-native-hosts.ps1
```

The local development installer publishes a self-contained `YTMTray.exe` for the
visible tray app and `YTMTray.NativeHost.exe` for browser native messaging. It
writes a native messaging manifest under `%LOCALAPPDATA%\YTM Enhancer\Tray` and
registers user-level native messaging keys for Edge, Chrome, and Firefox.

Release zips include the signed `YTMTray.Setup.exe` native installer, prebuilt
app and native host executables, and `release.json`. Direct release installs
check for newer `windows-tray-v*` GitHub Releases in the background. When an
update is available, the tray menu and flyout expose an install action that
downloads the update manifest, verifies the release zip checksum, and runs the
native installer after confirmation.

YTM Tray is currently a Connected Apps beta. Beta users should install from the
Windows tray install page or a component-scoped `windows-tray-v*` GitHub
Release, enable Connected Apps in YTM Enhancer, and use the tray popup or About
window to check for updates. The tray app, native host, and installer are signed
in GitHub Actions through Microsoft Artifact Signing.

YTM Tray supports one active browser connection at a time. The About window
shows the connected browser, and other browsers report that the tray is already
connected instead of silently failing.

Packaged installs also register YTM Tray in Windows Settings > Apps and add
Start Menu shortcuts. The installed `YTMTray.Setup.exe` handles uninstallation
without a command or PowerShell launcher.

For local QA against a temporary unpacked Chromium-family extension ID, pass an
extra native messaging origin:

```powershell
.\scripts\install-native-hosts.ps1 `
  -AdditionalAllowedOrigins chrome-extension://abcdefghijklmnopabcdefghijklmnop/
```

Uninstall local native messaging registration:

```powershell
.\scripts\uninstall-native-hosts.ps1
```

For release zips, run the signed native installer:

```powershell
.\YTMTray.Setup.exe
```

Uninstall through Windows Settings > Apps > Installed apps or Start Menu > YTM
Enhancer > Uninstall YTM Tray.

Release archives temporarily retain `install-native-hosts.ps1` only as a
compatibility bridge for the YTM Tray 0.1.6 in-app updater. It is not the
user-facing installer for current releases.

This app intentionally does not provide a Windows CLI. The user-facing Windows
Connected Apps surface is the tray app.
