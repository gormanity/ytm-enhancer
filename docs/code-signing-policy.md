# Code Signing Policy

This policy covers release signing for first-party native YTM Enhancer Connected
Apps.

## Current Windows Tray Signing

### Microsoft Artifact Signing

YTM Tray release executables are Authenticode-signed in GitHub Actions through
Microsoft Artifact Signing, formerly Azure Artifact Signing. The release
workflow authenticates to Azure through GitHub OIDC, signs `YTMTray.exe`,
`YTMTray.NativeHost.exe`, and `YTMTray.Setup.exe` before zipping the payloads,
and then verifies all three Authenticode signatures before publishing.

The GitHub Actions app registration must have the
`Artifact Signing Certificate Profile Signer` role on the Azure certificate
profile or Artifact Signing account. GitHub stores Azure identifiers in the
protected `windows-signing` environment; no PFX file or certificate password is
stored in the repository or GitHub secrets.

## Release Controls

- Windows tray releases are created only from `windows-tray-vX.Y.Z` tags.
- Release packages are built by GitHub Actions from the tagged source.
- `YTMTray.exe`, `YTMTray.NativeHost.exe`, and `YTMTray.Setup.exe` are signed
  before being zipped.
- Current install, update, and uninstall paths run the signed native setup
  executable instead of command or PowerShell launchers.
- Release zips are listed in `YTM-Tray-update.json` with SHA-256 checksums.
- The tray updater verifies package checksums before starting the installer.
- The release workflow uses OIDC and does not export or import signing keys.

## Local Signing Smoke

The remote Windows QA signing smoke still creates a disposable self-signed
certificate on the QA VM. That check validates the local PFX fallback and the
package script's fail-closed behavior for all three executables without
installing production signing secrets on a development machine. It is not the
release signing path.
