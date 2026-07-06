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
  - `YTM-Tray-<version>-win-x64.zip`
  - `YTM-Tray-<version>-win-arm64.zip`
  - `YTM-Tray-update.json`
- Install page:
  `https://gormanity.github.io/ytm-enhancer/windows-tray/install.html`.
- Update source: `https://api.github.com/repos/gormanity/ytm-enhancer/releases`.

The install page links to the component-scoped `windows-tray-v*` GitHub Releases
list for release zip downloads.

YTM Tray currently supports Chrome, Microsoft Edge, and Firefox native messaging
on Windows.

Release packages include prebuilt self-contained executables, the native host
relay, friendly install and uninstall command launchers, the installer script,
the uninstaller script, and package metadata. Users do not need the .NET SDK
when installing from a release zip.

The installer registers YTM Tray as a user-level Windows app under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray`, creates
Start Menu shortcuts under `YTM Enhancer`, and copies the uninstaller into the
installed app folder. Users can uninstall from Windows Settings > Apps >
Installed apps, from Start Menu > YTM Enhancer > Uninstall YTM Tray, or by
running `Uninstall YTM Tray.cmd` from the extracted release zip.

The release workflow signs `YTMTray.exe` and `YTMTray.NativeHost.exe` with Azure
Artifact Signing before zipping release payloads. Signing is required for
`windows-tray-v*` tag releases.

## Beta User Path

YTM Tray is a Connected Apps beta. The install page and release notes should set
that expectation plainly without overstating risk: users install a signed direct
package, enable Connected Apps in the extension, and can remove the app through
normal Windows app-management surfaces.

The user-facing release path is:

1. Download the current `YTM-Tray-<version>-<runtime>.zip` from the Windows tray
   install page or component-scoped GitHub Release.
2. Extract the zip and run `Install YTM Tray.cmd`.
3. Start YTM Tray, open YTM Enhancer > Connected Apps, and enable Connected Apps
   plus the YTM Tray card.
4. Use `Check for Updates` from the tray popup or About window. The app checks
   the `windows-tray-v*` GitHub release list, downloads `YTM-Tray-update.json`,
   verifies the package checksum, and hands off to the packaged installer.
5. Uninstall from Windows Settings > Apps > Installed apps, Start Menu > YTM
   Enhancer > Uninstall YTM Tray, or the packaged `Uninstall YTM Tray.cmd`.

## Azure Artifact Signing

Windows tray releases use Azure Artifact Signing from a protected GitHub
environment named `windows-signing`. The release workflow authenticates with
GitHub OIDC, builds unzipped package payloads, signs all payload executables,
verifies Authenticode signatures, then archives the signed payloads.

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
Artifact Signing account. The endpoint must match the Artifact Signing account
region.

See [Code Signing Policy](code-signing-policy.md) for the current policy and
local signing-smoke details.

Run the manual `Windows Tray Signing Check` workflow on `main` after changing
release signing, packaging, or installer behavior. It builds `win-x64` and
`win-arm64` payloads, signs them with Azure Artifact Signing, verifies
signatures, archives the release packages, and generates the update manifest
without publishing a GitHub Release:

```sh
gh workflow run "Windows Tray Signing Check" \
  --repo gormanity/ytm-enhancer \
  --ref main
```

Local package generation remains unsigned by default so development and dry-run
package smokes do not need production signing material. Set
`YTM_WINDOWS_TRAY_CODESIGN_REQUIRED=1` locally when validating that the local
PFX fallback fails closed without a signing certificate.

The update manifest is published as a release asset with SHA-256 checksums,
download URLs, runtime identifiers, the component tag, and the minimum Windows
version.

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
6. Starts the packaged `install-native-hosts.ps1`.
7. Quits so the installer can replace the running tray executable.

The updater is intentionally not silent-installing. The user confirms the
download/install handoff, and the installer continues to use user-level
registration under `%LOCALAPPDATA%` and `HKCU`.

Before replacing files or registry keys, the installer snapshots the current
tray executables, package metadata, native messaging manifests, and Chrome,
Edge, and Firefox native messaging registrations. If install or registration
fails, it restores the previous install state before returning the error.

## Local Package Smoke

Run these commands from a Windows environment with the .NET 10 SDK:

```powershell
pnpm run windows-tray:test
pnpm run windows-tray:package:win-x64
pnpm run windows-tray:package:win-arm64
pnpm run windows-tray:update-manifest
```

Then extract the package for the current architecture and run:

```powershell
.\Install YTM Tray.cmd
.\Uninstall YTM Tray.cmd
```

The installer should copy prebuilt binaries from the release package. It should
not require `dotnet` unless it is being run from the source checkout.

The remote package smoke performs the same build, manifest, extraction, and
prebuilt installer path on the Windows QA VM. It also forces a failed reinstall
and verifies that the previous installed executable is restored:

```sh
scripts/remote/windows-qa/tray-package-smoke.sh
```

The remote signing smoke requires the Windows SDK `signtool.exe`. It creates a
disposable self-signed code-signing certificate, exports it to a temporary PFX,
runs package generation with `YTM_WINDOWS_TRAY_CODESIGN_REQUIRED=1`, verifies
both packaged executables have Authenticode signatures from the disposable
signer, and removes the test certificate:

```sh
scripts/remote/windows-qa/tray-signing-smoke.sh
```

## Release Steps

1. Update `apps/windows-tray/release/metadata.json`.
2. Update the default version metadata in
   `apps/windows-tray/src/YTMTray.Core/YTMTray.Core.csproj`.
3. Run the manual `Windows Tray Signing Check` workflow after changing release
   signing, packaging, or installer behavior.
4. Run targeted tests:

```sh
pnpm exec vitest run tests/apps/windows-tray-scaffold.test.ts
scripts/remote/windows-qa/tray-smoke.sh
scripts/remote/windows-qa/tray-package-smoke.sh
scripts/remote/windows-qa/tray-signing-smoke.sh
```

5. Run manual tray button smoke when release plumbing, native messaging, or
   connector behavior changed:

```sh
scripts/remote/windows-qa/tray-button-smoke.sh
```

6. For a beta release candidate, run the operational smoke and leave the app
   installed for hands-on testing:

```sh
scripts/remote/windows-qa/tray-operational-smoke.sh X.Y.Z
```

7. Create a `windows-tray-vX.Y.Z` tag from the verified commit.
8. Push the tag.
9. Confirm the `Windows Tray Release` workflow publishes:
   - a GitHub Release named `YTM Tray X.Y.Z`
   - a component release that does not replace GitHub's repo-wide latest release
   - `win-x64` and `win-arm64` release zips
   - `YTM-Tray-update.json` with package checksums and release URLs
   - `Install YTM Tray.cmd` and `Uninstall YTM Tray.cmd` in each zip
   - signed `YTMTray.exe` and `YTMTray.NativeHost.exe`
10. On a clean Windows account, install from the release zip and confirm:

- `YTMTray.exe` and `YTMTray.NativeHost.exe` are installed under
  `%LOCALAPPDATA%\YTM Enhancer\Tray`
- Edge, Chrome, and Firefox native messaging registry keys point at their
  manifests
- the tray app connects after Connected Apps is enabled
- playback controls, seeking, focus, About, and Quit still work
- Windows Settings > Apps > Installed apps shows YTM Tray
- uninstall removes registry keys, Start Menu shortcuts, and app files

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
- When release packaging, installer behavior, update-manifest generation, native
  host paths, or connector behavior changes.
- When the in-app updater is added or changed.

Manual validation is optional:

- For ordinary app-only releases when Windows tray tests and remote tray smoke
  pass and the release does not change packaging, updater, native host, or
  connector behavior.

## Follow-Up

The current updater validates package checksums and safely hands off to the
packaged installer. SmartScreen reputation and a future package-manager channel
remain separate release hardening tasks.
