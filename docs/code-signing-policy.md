# Code Signing Policy

This policy covers release signing for first-party native YTM Enhancer Connected
Apps.

## Current Windows Tray Signing

### Azure Artifact Signing

YTM Tray release zips are Authenticode-signed in GitHub Actions with Azure
Artifact Signing. The release workflow authenticates to Azure through GitHub
OIDC, signs `YTMTray.exe` and `YTMTray.NativeHost.exe` before zipping the
payloads, and then verifies both Authenticode signatures before publishing.

The GitHub Actions app registration must have the
`Artifact Signing Certificate Profile Signer` role on the Azure certificate
profile or Artifact Signing account. GitHub stores Azure identifiers in the
protected `windows-signing` environment; no PFX file or certificate password is
stored in the repository or GitHub secrets.

## Release Controls

- Windows tray releases are created only from `windows-tray-vX.Y.Z` tags.
- Release packages are built by GitHub Actions from the tagged source.
- `YTMTray.exe` and `YTMTray.NativeHost.exe` are signed before being zipped.
- Release zips are listed in `YTM-Tray-update.json` with SHA-256 checksums.
- The tray updater verifies package checksums before starting the installer.
- The release workflow uses OIDC and does not export or import signing keys.

## Local Signing Smoke

The remote Windows QA signing smoke still creates a disposable self-signed
certificate on the QA VM. That check validates the local PFX fallback and the
package script's fail-closed behavior without installing production signing
secrets on a development machine. It is not the release signing path.
