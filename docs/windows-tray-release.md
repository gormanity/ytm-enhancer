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
  `https://github.com/gormanity/ytm-enhancer/releases?q=windows-tray-v&expanded=true`.
- Update source: `https://api.github.com/repos/gormanity/ytm-enhancer/releases`.

Release packages include prebuilt self-contained executables, the native host
relay, the installer script, the uninstaller script, and package metadata. Users
do not need the .NET SDK when installing from a release zip.

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
.\install-native-hosts.ps1
.\uninstall-native-hosts.ps1
```

The installer should copy prebuilt binaries from the release package. It should
not require `dotnet` unless it is being run from the source checkout.

The remote package smoke performs the same build, manifest, extraction, and
prebuilt installer path on the Windows QA VM:

```sh
scripts/remote/windows-qa/tray-package-smoke.sh
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
```

4. Run manual tray button smoke when release plumbing, native messaging, or
   connector behavior changed:

```sh
scripts/remote/windows-qa/tray-button-smoke.sh
```

5. Create a `windows-tray-vX.Y.Z` tag from the verified commit.
6. Push the tag.
7. Confirm the `Windows Tray Release` workflow publishes:
   - a GitHub Release named `YTM Tray X.Y.Z`
   - a component release that does not replace GitHub's repo-wide latest release
   - `win-x64` and `win-arm64` release zips
   - `YTM-Tray-update.json` with package checksums and release URLs
8. On a clean Windows account, install from the release zip and confirm:
   - `YTMTray.exe` and `YTMTray.NativeHost.exe` are installed under
     `%LOCALAPPDATA%\YTM Enhancer\Tray`
   - Edge and Chrome native messaging registry keys point at the manifest
   - the tray app connects after Connected Apps is enabled
   - playback controls, seeking, focus, About, and Quit still work
   - uninstall removes registry keys and app files

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
packaged installer. Windows Authenticode signing, SmartScreen reputation,
rollback, and a future package-manager channel remain separate release hardening
tasks.
