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

4. Test install, `ytme --version`, `ytme doctor`, browser connection, and
   uninstall from the packaged archive on macOS and Linux.
5. Run the repository CI-equivalent checks and push the verified release change
   to `main`.
6. Confirm GitHub Actions is green.
7. Create and push `cli-vX.Y.Z`.
8. Confirm `CLI Release` publishes all four archives and `SHA256SUMS` without
   replacing the repository-wide latest extension release.
9. Confirm Product Pages lists the published version and all four downloads.
10. Download the published packages and repeat the macOS and Linux install,
    connection, command, and uninstall smoke.

## Manual Validation Policy

Manual validation is required for the first public CLI release and whenever
packaging, signing, native host installation, connector behavior, or supported
platforms change. It is optional for ordinary CLI-only changes after the
packaged install and connector paths have stable automated coverage.
