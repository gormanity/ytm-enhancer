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

Website users download one `YTM-Tray-<version>-Setup.exe` offline installer. It
detects the Windows operating system architecture and installs the native x64 or
ARM64 tray app and native host automatically. Users do not need to choose a
runtime, extract an archive, or install the .NET runtime.

The component release still contains architecture-specific release zips. Those
zips include the signed `YTMTray.Setup.exe` native installer, prebuilt app and
native host executables, and `release.json`. They are updater assets rather than
the website's direct-install path. When an update is available, the tray menu
and flyout download the update manifest, verify the selected release zip
checksum, and run its native installer after confirmation.

YTM Tray is currently a Connected Apps beta. Beta users should install from the
Windows tray install page or a component-scoped `windows-tray-v*` GitHub
Release, enable Connected Apps in YTM Enhancer, and use the tray popup or About
window to check for updates. GitHub Actions first signs the executables inside
both runtime packages, builds the combined installer from those signed packages,
and then signs the combined installer through Microsoft Artifact Signing.

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

Build both updater packages, the update manifest, and the combined offline
installer on Windows:

```powershell
pnpm run windows-tray:package:win-x64
pnpm run windows-tray:package:win-arm64
pnpm run windows-tray:update-manifest
pnpm run windows-tray:installer
```

Run the website-facing installer:

```powershell
.\apps\windows-tray\.build\installer\YTM-Tray-<version>-Setup.exe
```

Uninstall through Windows Settings > Apps > Installed apps or Start Menu > YTM
Enhancer > Uninstall YTM Tray.

Release archives temporarily retain `install-native-hosts.ps1` only as a
compatibility bridge for the YTM Tray 0.1.6 in-app updater. It is not the
user-facing installer for current releases.

This app intentionally does not provide a Windows CLI. The user-facing Windows
Connected Apps surface is the tray app.
