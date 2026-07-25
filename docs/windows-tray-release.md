# Windows Tray Release

The YTM Tray connector is versioned independently from the browser extension.
Extension releases use `vX.Y.Z`; Windows tray releases use
`windows-tray-vX.Y.Z`.

Windows tray GitHub Releases are component-scoped artifact pages. They do not
become the repository-wide latest release because GitHub exposes only one latest
release per repository and YTM Enhancer's browser extension owns that badge.

## Channel

Direct install:

- Assets:
  - `YTM-Tray-<version>-Setup.exe`
  - `YTM-Tray-<version>-win-x64.zip`
  - `YTM-Tray-<version>-win-arm64.zip`
  - `YTM-Tray-update.json`
- Install page:
  `https://gormanity.github.io/ytm-enhancer/windows-tray/install.html`.
- Update source: `https://api.github.com/repos/gormanity/ytm-enhancer/releases`.

When the asset is published, the install page links directly to the current
`YTM-Tray-<version>-Setup.exe`. This one offline installer contains both runtime
packages and selects x64 or ARM64 automatically. Website users do not choose an
architecture or extract a zip.

Before the first combined installer is published, the page labels its link as a
release-page fallback and omits the direct installer channel from
`releases.json`. Both Product Pages and menu bar releases resolve this state
from the same published-release script, and their Pages deployments share one
concurrency group.

The architecture-specific zips remain release assets for the in-app updater.
They are not the website's direct-install path.

Product Pages resolves the newest published Windows tray release rather than
advertising the version currently staged in source metadata. A successful
`Windows Tray Release` run triggers a Product Pages deployment, so the existing
download remains available until its replacement has been published.

YTM Tray currently supports Chrome, Microsoft Edge, and Firefox native messaging
on Windows.

Each runtime package includes the prebuilt self-contained tray app, native host
relay, signed native setup executable, package metadata, and a temporary legacy
update bridge. The combined installer embeds both signed runtime packages. Users
do not need the .NET SDK, and normal installation or uninstallation does not use
command or PowerShell launchers.

The installer registers YTM Tray as a user-level Windows app under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray`, creates
Start Menu shortcuts under `YTM Enhancer`, and copies the uninstaller into the
installed app folder. Users can uninstall from Windows Settings > Apps >
Installed apps, from Start Menu > YTM Enhancer > Uninstall YTM Tray, or by
running the installed `YTMTray.Setup.exe uninstall`.

The release workflow uses two Microsoft Artifact Signing passes. It signs
`YTMTray.exe`, `YTMTray.NativeHost.exe`, and `YTMTray.Setup.exe` before
archiving the runtime packages. It then builds the combined installer from those
signed packages and signs `YTM-Tray-<version>-Setup.exe`. Signing is required
for `windows-tray-v*` tag releases.

## Beta User Path

YTM Tray is a Connected Apps beta. The install page and release notes should set
that expectation plainly without overstating risk: users install a signed direct
package, enable Connected Apps in the extension, and can remove the app through
normal Windows app-management surfaces.

The user-facing release path is:

1. Download `YTM-Tray-<version>-Setup.exe` from the Windows tray install page.
2. Run the installer. It selects x64 or ARM64 automatically and installs the
   matching native app and native host.
3. Start YTM Tray, open YTM Enhancer > Connected Apps, and enable Connected Apps
   plus the YTM Tray card.
4. Use `Check for Updates` from the tray popup or About window. The app checks
   the `windows-tray-v*` GitHub release list, downloads `YTM-Tray-update.json`,
   selects and verifies the architecture-specific updater zip, and hands off to
   its packaged installer.
5. Uninstall from Windows Settings > Apps > Installed apps, Start Menu > YTM
   Enhancer > Uninstall YTM Tray, or run the installed
   `YTMTray.Setup.exe uninstall`.

## Microsoft Artifact Signing

Windows tray releases use Microsoft Artifact Signing, formerly Azure Artifact
Signing, from a protected GitHub environment named `windows-signing`. The
release workflow authenticates with GitHub OIDC and signs in this order:

1. Build the unzipped x64 and ARM64 runtime payloads.
2. Sign and verify every executable in both payloads.
3. Archive the signed payloads and generate `YTM-Tray-update.json`.
4. Build the combined installer from the two signed runtime zips.
5. Sign and verify `YTM-Tray-<version>-Setup.exe`.

The outer installer must be built after the first signing pass so it never
embeds unsigned inner executables.

The `windows-signing` GitHub environment must provide these secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

It must also provide these environment variables:

- `AZURE_ARTIFACT_SIGNING_ENDPOINT`
- `AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME`
- `AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME`

The Azure app registration must have the
`Artifact Signing Certificate Profile Signer` role on the certificate profile or
Artifact Signing account. The Azure-backed endpoint must match the Microsoft
Artifact Signing account region.

See [Code Signing Policy](code-signing-policy.md) for the current policy and
local signing-smoke details.

Run the manual `Windows Tray Signing Check` workflow on `main` after changing
release signing, packaging, or installer behavior. It builds `win-x64` and
`win-arm64` payloads, signs them with Microsoft Artifact Signing, verifies
signatures, archives the release packages, generates the update manifest, builds
the combined installer, and signs and verifies that installer in a second pass.
It uploads the EXE, zips, and manifest as the `windows-tray-signed-candidate` QA
artifact for three days:

```sh
gh workflow run "Windows Tray Signing Check" \
  --repo gormanity/ytm-enhancer \
  --ref main

gh run download RUN_ID \
  --repo gormanity/ytm-enhancer \
  --name windows-tray-signed-candidate
```

Use the signed combined EXE for pre-tag install, tray/native-host runtime,
uninstall, and Smart App Control QA. Its update manifest points to the future
release URLs, so validate live updater downloads after publishing the component
release.

Local package generation remains unsigned by default so development and dry-run
package smokes do not need production signing material. Set
`YTM_WINDOWS_TRAY_CODESIGN_REQUIRED=1` locally when validating that the local
PFX fallback fails closed without a signing certificate.

The update manifest lists only the architecture-specific updater zips. It is
published with SHA-256 checksums, download URLs, runtime identifiers, the
component tag, and the minimum Windows version. The website-facing combined
installer is not an updater-manifest asset.

## Checksum-Verified In-App Updates

The tray app checks the GitHub release list in the background and marks the tray
menu and flyout when a newer `windows-tray-v*` release is available. Users can
also choose `Check for Updates` manually.

When the user accepts an update, the tray app:

1. Downloads the release's `YTM-Tray-update.json`.
2. Selects the package for the current Windows runtime.
3. Downloads the release zip.
4. Verifies the zip against the manifest SHA-256 checksum.
5. Extracts the zip with path traversal protection.
6. Starts the signed packaged `YTMTray.Setup.exe`.
7. Quits so the installer can replace the running tray executable.

The updater is intentionally not silent-installing. The user confirms the
download/install handoff, and the installer continues to use user-level
registration under `%LOCALAPPDATA%` and `HKCU`.

The 0.1.6 release invokes `install-native-hosts.ps1` during its update handoff.
Release packages temporarily retain that script as a compatibility bridge that
starts the native setup executable. Current installs, updates, and uninstalls do
not use the script directly.

Before replacing files or registry keys, setup snapshots the current tray
executables, package metadata, native messaging manifests, and Chrome, Edge, and
Firefox native messaging registrations. If install or registration fails, it
restores the previous install state before returning the error.

## Local Package Smoke

Run these commands from a Windows environment with the .NET 10 SDK:

```powershell
pnpm run windows-tray:test
pnpm run windows-tray:package:win-x64
pnpm run windows-tray:package:win-arm64
pnpm run windows-tray:update-manifest
pnpm run windows-tray:installer
```

Then run the combined installer:

```powershell
.\apps\windows-tray\.build\installer\YTM-Tray-<version>-Setup.exe
& "$env:LOCALAPPDATA\YTM Enhancer\Tray\YTMTray.Setup.exe" uninstall
```

The combined installer should select the operating system architecture and copy
the matching prebuilt binaries from its embedded runtime package. The generated
installer is self-contained; end users do not need `dotnet`.

The remote package smoke builds both runtime zips, the manifest, and the
combined installer on the Windows QA VM. It installs through the combined EXE,
checks that the native runtime was selected, then forces a failed reinstall
through the packaged native setup and verifies that the previous installed
executable is restored:

```sh
scripts/remote/windows-qa/tray-package-smoke.sh
```

The remote signing smoke requires the Windows SDK `signtool.exe`. It creates a
disposable self-signed code-signing certificate, exports it to a temporary PFX,
runs package generation with `YTM_WINDOWS_TRAY_CODESIGN_REQUIRED=1`, verifies
all executables in both runtime packages, builds and signs the combined
installer, verifies its Authenticode signature, and removes the test
certificate:

```sh
scripts/remote/windows-qa/tray-signing-smoke.sh
```

## Release Steps

1. Update `apps/windows-tray/release/metadata.json`.
2. Update the default version metadata in
   `apps/windows-tray/src/YTMTray.Core/YTMTray.Core.csproj`.
3. Run targeted tests:

```sh
pnpm exec vitest run tests/apps/windows-tray-scaffold.test.ts
scripts/remote/windows-qa/tray-smoke.sh
scripts/remote/windows-qa/tray-package-smoke.sh
scripts/remote/windows-qa/tray-signing-smoke.sh
```

4. Push the verified release commit to `main` and wait for its required checks.
5. Run the manual `Windows Tray Signing Check` workflow on that exact commit
   after changing release signing, packaging, or installer behavior. Download
   its `windows-tray-signed-candidate` artifact.
6. Copy the signed combined installer outside the Windows remote QA work root,
   then validate install and uninstall with Smart App Control enforcement
   enabled:

```sh
scripts/remote/windows-qa/tray-sac-smoke.sh \
  'C:\path\to\YTM-Tray-X.Y.Z-Setup.exe'
```

7. Run manual tray button smoke when release plumbing, native messaging, or
   connector behavior changed:

```sh
scripts/remote/windows-qa/tray-button-smoke.sh
```

8. Draft user-facing release notes and obtain approval.
9. Create a `windows-tray-vX.Y.Z` tag from the verified commit.
10. Push the tag.
11. Confirm the `Windows Tray Release` workflow publishes:

- a GitHub Release named `YTM Tray X.Y.Z`
- a component release that does not replace GitHub's repo-wide latest release
- one signed `YTM-Tray-X.Y.Z-Setup.exe` direct installer
- `win-x64` and `win-arm64` updater zips
- `YTM-Tray-update.json` with package checksums and release URLs
- signed `YTMTray.exe`, `YTMTray.NativeHost.exe`, and `YTMTray.Setup.exe` inside
  both updater packages
- a combined installer built after inner signing and signed in a second pass
- no command launchers or packaged uninstall PowerShell script

12. Add the approved notes to the published release and confirm Product Pages
    deploys with the new release link.
13. Run the published operational smoke and leave the app installed for hands-on
    testing:

```sh
scripts/remote/windows-qa/tray-operational-smoke.sh X.Y.Z
```

14. Validate the live update from the previous release to the new release.
15. On a clean Windows account, install from `YTM-Tray-X.Y.Z-Setup.exe` and
    confirm:

- the combined installer selects the native x64 or ARM64 runtime
- `YTMTray.exe`, `YTMTray.NativeHost.exe`, and `YTMTray.Setup.exe` are under
  `%LOCALAPPDATA%\YTM Enhancer\Tray`
- Edge, Chrome, and Firefox native messaging registry keys point at their
  manifests
- the tray app connects after Connected Apps is enabled
- playback controls, seeking, focus, About, and Quit still work
- Windows Settings > Apps > Installed apps shows YTM Tray
- uninstall removes registry keys, Start Menu shortcuts, and app files
- Smart App Control permits setup, tray/native-host bridge operation, and
  uninstall from an Internet-marked combined installer

For operational testing where a developer needs to keep using the installed
candidate, run `scripts/remote/windows-qa/tray-operational-smoke.sh` instead of
the destructive release E2E. It verifies the published package, launches the
tray app in the active Windows desktop session, opens Chrome to YouTube Music,
and intentionally leaves the app installed.

The release workflow derives package and manifest versions from the
`windows-tray-vX.Y.Z` tag and compares generated GitHub release notes against
the previous `windows-tray-vX.Y.Z` tag, not the previous repository tag. Use a
lower numeric tag, such as `windows-tray-v0.0.1`, for a throwaway release dry
run rather than a suffix tag such as `windows-tray-v0.1.0-test`.

## Manual Validation Policy

Manual validation is required:

- Before the first public Windows tray release.
- When release packaging, combined-installer behavior, signing order,
  update-manifest generation, native host paths, or connector behavior changes.
- When the in-app updater is added or changed.

Manual validation is optional:

- For ordinary app-only releases when Windows tray tests and remote tray smoke
  pass and the release does not change packaging, updater, native host, or
  connector behavior.

## Follow-Up

The current updater validates package checksums and safely hands off to the
signed native installer. SmartScreen download reputation and a future
package-manager channel remain separate release hardening tasks.
