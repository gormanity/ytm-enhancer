# Code Signing Policy

This policy covers release signing for first-party native YTM Enhancer Connected
Apps.

## Current Windows Tray Beta

YTM Tray beta release zips are Authenticode-signed in GitHub Actions with a
short-lived self-signed code-signing certificate generated during the release
workflow. The certificate private key exists only on the workflow runner for
that run and is removed before the job exits.

Self-signing is a beta-only control. It confirms that the release workflow can
produce signed Windows binaries and gives testers an Authenticode signature to
inspect, but it does not establish a trusted Windows publisher identity and does
not avoid SmartScreen or unknown-publisher warnings.

## Release Controls

- Windows tray releases are created only from `windows-tray-vX.Y.Z` tags.
- Release packages are built by GitHub Actions from the tagged source.
- `YTMTray.exe` and `YTMTray.NativeHost.exe` are signed before being zipped.
- Release zips are listed in `YTM-Tray-update.json` with SHA-256 checksums.
- The tray updater verifies package checksums before starting the installer.
- Release workflows remove temporary signing certificates and PFX files before
  the job exits.

## Future Trusted Signing

Before the Windows tray app leaves beta, the project should switch from
self-signing to a trusted provider, such as SignPath Foundation, Microsoft Store
package signing, or Microsoft Artifact Signing.

If SignPath Foundation accepts the project, release copy and download pages
should include the required attribution:

```text
Free code signing provided by SignPath.io, certificate by SignPath Foundation
```

Until that provider is active, project pages must not imply that Windows tray
artifacts are signed by SignPath Foundation or by any other trusted publisher.
