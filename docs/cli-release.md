# CLI Release

YTM Enhancer CLI is versioned independently from the browser extension.
Extension releases use `vX.Y.Z`; CLI releases use `cli-vX.Y.Z`.

## Channel

The `CLI Release` workflow publishes:

- prebuilt `ytme` and `ytme-native-host` binaries for macOS x64 and arm64
- prebuilt binaries for Linux x64 and arm64
- a user-level installer and uninstaller in every archive
- `SHA256SUMS` covering every package
- curated, versioned GitHub release notes

macOS binaries are signed with Developer ID and their archives are notarized.
The installer writes only to the current user's data, configuration, and binary
directories. It does not require Go, `sudo`, or system-wide changes.

Every package contains `VERSION` and `RUNTIME` markers. The installer validates
them before making changes, refuses to replace unmanaged commands, manifests, or
install directories, and records the paths it owns. The installed uninstaller
reads that managed state and removes only files that still belong to the same
installation.

Notarization tickets cannot be stapled to ZIP archives or standalone binaries.
The release workflow requires Apple to accept both macOS archives, then verifies
the extracted binaries' Developer ID signatures, secure timestamps, and hardened
runtime metadata. An online Mac retrieves each standalone binary's notarization
ticket when a user runs it, so a clean-machine browser-download smoke remains
part of manual candidate acceptance.

The stable install page is:

`https://gormanity.github.io/ytm-enhancer/cli/`

## Required Secrets

The workflow reuses the macOS release credentials:

- `CERTIFICATE_PASSWORD`
- `DEVELOPER_ID_APPLICATION_P12_BASE64`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`
- `APP_STORE_CONNECT_ISSUER_ID` when required by the API key

## Release Steps

1. Update `ConnectorVersion` in `apps/cli/internal/protocol/protocol.go`.
2. Add user-facing notes at `apps/cli/release/notes/X.Y.Z.md` and obtain
   approval.
3. Run:

```sh
pnpm exec vitest run tests/apps/cli-scaffold.test.ts
pnpm exec vitest run tests/apps/companion-initial-releases.test.ts
pnpm run cli:test
pnpm run cli:package -- --runtime=macos-x64
pnpm run cli:package -- --runtime=macos-arm64
pnpm run cli:package -- --runtime=linux-x64
pnpm run cli:package -- --runtime=linux-arm64
```

4. Test install, `ytme --version`, `ytme doctor`, browser connection, failure
   rollback, and uninstall from the packaged archive on macOS and Linux.
5. Run the repository CI-equivalent checks and push the verified release change
   to `main`.
6. Confirm GitHub Actions is green.
7. From the repository's default branch, run `CLI Release` manually with version
   `X.Y.Z`. Confirm it passes signing, notarization, artifact validation, and
   uploads the non-publishing candidate artifact.
8. Download the candidate artifact and repeat the macOS and Linux install,
   connection, command, and uninstall smoke.
9. Create and push `cli-vX.Y.Z`.
10. Confirm `CLI Release` publishes all four archives and `SHA256SUMS` without
    replacing the repository-wide latest extension release.
11. Confirm Product Pages lists the published version and all four downloads.
12. Download the published packages and repeat the macOS and Linux install,
    connection, command, and uninstall smoke.

After signing and notarization, the workflow runs
`scripts/ci/validate-cli-release-artifacts.sh`. This CI-only validator checks
the exact archive set, SHA-256 checksums, archive paths, runtime markers,
executable architectures, macOS Developer ID signatures, secure timestamps,
hardened runtime, and a packaged install, rollback, and uninstall on the host
Mac. The preceding `notarytool` step must return Apple's accepted status for
both macOS archives before validation runs.

Manual runs never publish a GitHub release. They retain the signed and notarized
candidate packages as a workflow artifact for 14 days. Tag-triggered runs
rebuild the packages and repeat the same validation before publishing, so
signing timestamps mean the candidate and release archives are not expected to
be byte-for-byte identical.

## Checksums

Download `SHA256SUMS` from the same GitHub release as the package. From the
directory containing both files, set `archive` to the package you downloaded and
verify only its checksum entry:

```sh
# macOS
archive="YTM-Enhancer-CLI-X.Y.Z-macos-arm64.zip"
awk -v archive="$archive" '$2 == archive' SHA256SUMS |
  shasum -a 256 -c -

# Linux
archive="YTM-Enhancer-CLI-X.Y.Z-linux-x64.tar.gz"
awk -v archive="$archive" '$2 == archive' SHA256SUMS |
  sha256sum -c -
```

The release workflow performs the macOS form after signing and notarization and
before uploading any assets.

## Manual Validation Policy

Manual validation is required for the first public CLI release and whenever
packaging, signing, native host installation, connector behavior, or supported
platforms change. It is optional for ordinary CLI-only changes after the
packaged install and connector paths have stable automated coverage.
