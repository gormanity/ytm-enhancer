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
- Initial packages are unsigned and not notarized. They contain an ad-hoc signed
  app bundle, and users may need to approve the package through macOS Gatekeeper
  prompts.

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

- `SPARKLE_PUBLIC_ED_KEY`
- `SPARKLE_PRIVATE_ED_KEY_BASE64`
- `HOMEBREW_TAP_DEPLOY_KEY`

Sparkle keys sign app updates and do not require Apple Developer Program
membership. The Homebrew tap deploy key updates the external tap repository
without requiring a broad personal access token.

The Sparkle keys were generated with the keychain account
`gormanity.ytm-enhancer.menu-bar`.

Developer ID certificates, Apple notarization credentials, and App Store Connect
API keys are intentionally not required for the initial release. Add them only
after the project is ready to ship notarized macOS packages.

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
- Confirm the expected macOS unidentified developer warning appears.
- Approve the package through the macOS Gatekeeper prompt.
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
