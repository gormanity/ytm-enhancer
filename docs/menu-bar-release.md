# Menu Bar Release

The YTM Menu Bar connector is versioned independently from the browser
extension. Extension releases use `vX.Y.Z`; menu bar releases use
`menu-bar-vX.Y.Z`.

## Channels

Direct install:

- Asset: `YTM-Menu-Bar-<version>.pkg`.
- Update archive: `YTM-Menu-Bar-<version>.zip`.
- Update feed: `https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml`.
- Updates are handled by Sparkle inside the app.

Homebrew install:

- Asset: `YTM-Menu-Bar-Homebrew-<version>.pkg`.
- Cask: `gormanity/homebrew-tap/Casks/ytm-menu-bar.rb`.
- Install command:

```sh
brew install --cask gormanity/tap/ytm-menu-bar
```

- Update command:

```sh
brew update && brew upgrade --cask ytm-menu-bar
```

Homebrew builds disable Sparkle so Homebrew remains the source of truth for
updates.

## Required Secrets

The `Menu Bar Release` workflow requires:

- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`
- `CERTIFICATE_PASSWORD`
- `DEVELOPER_ID_APPLICATION`
- `DEVELOPER_ID_APPLICATION_P12_BASE64`
- `DEVELOPER_ID_INSTALLER`
- `DEVELOPER_ID_INSTALLER_P12_BASE64`
- `SPARKLE_PUBLIC_ED_KEY`
- `SPARKLE_PRIVATE_ED_KEY_BASE64`
- `HOMEBREW_TAP_TOKEN`

The Developer ID values without `_P12_BASE64` are the certificate identity names
passed to `codesign` and `productbuild`.

## Release Steps

1. Update `apps/menu-bar/release/metadata.json`.
2. Update `apps/menu-bar/Sources/YTMMenuBarConnector/AppMetadata.swift`.
3. Run targeted tests:

```sh
pnpm exec vitest run tests/apps/menu-bar-scaffold.test.ts
pnpm exec vitest run tests/core/connectors/connected-apps-popup.test.ts
swift build --package-path apps/menu-bar -c release
```

4. Create a `menu-bar-vX.Y.Z` tag from the verified commit.
5. Push the tag.
6. Confirm the `Menu Bar Release` workflow publishes:
   - direct `.pkg`
   - Homebrew `.pkg`
   - Sparkle `.zip`
   - `appcast.xml`
7. Confirm GitHub Pages serves the updated appcast.
8. Confirm the Homebrew tap cask was updated.

## Manual Acceptance

Direct install:

- Install the `.pkg` on a clean macOS account.
- Confirm `/Applications/YTM Menu Bar.app` exists.
- Confirm native host manifests exist under `/Library`.
- Enable Connected Apps in the extension.
- Confirm playback state and controls work.
- Confirm `Check for Updates...` can reach the appcast.

Homebrew install:

- Install with:

```sh
brew install --cask gormanity/tap/ytm-menu-bar
```

- Confirm the app connects to the extension.
- Confirm the app shows Homebrew update guidance instead of Sparkle updates.
- Confirm `brew upgrade --cask ytm-menu-bar` updates a test release.
