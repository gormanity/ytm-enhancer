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

The installer publishes a self-contained `YTMTray.exe` for the visible tray app
and `YTMTray.NativeHost.exe` for browser native messaging. It writes a native
messaging manifest under `%LOCALAPPDATA%\YTM Enhancer\Tray` and registers
user-level native messaging keys for Edge, Chrome, and Firefox.

Release zips include prebuilt executables plus `release.json`. Direct release
installs check for newer `windows-tray-v*` GitHub Releases in the background.
When an update is available, the tray menu and flyout expose an install action
that downloads the update manifest, verifies the release zip checksum, and runs
the packaged installer after confirmation.

Packaged installs also register YTM Tray in Windows Settings > Apps, add Start
Menu shortcuts, and install a local uninstaller script under
`%LOCALAPPDATA%\YTM Enhancer\Tray`.

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

For release zips, prefer the packaged command launchers:

```powershell
.\Install YTM Tray.cmd
.\Uninstall YTM Tray.cmd
```

This app intentionally does not provide a Windows CLI. The user-facing Windows
Connected Apps surface is the tray app.
