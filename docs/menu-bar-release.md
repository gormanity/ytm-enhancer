# Menu Bar Release

The YTM Menu Bar connector is versioned independently from the browser
extension. Extension releases use `vX.Y.Z`; menu bar releases use
`menu-bar-vX.Y.Z`.

## Channels

Direct install:

- Asset: `YTM-Menu-Bar-<version>.pkg`.
- Update archive: `YTM-Menu-Bar-<version>.zip`.
- Install page:
  `https://gormanity.github.io/ytm-enhancer/menu-bar/install.html`.
- Update feed: `https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml`.
- Updates are handled by Sparkle inside the app. Direct builds probe the appcast
  silently and expose download/install actions from `About YTM Menu Bar`.
- Direct packages and app bundles are signed with Developer ID, notarized by
  Apple, and stapled before release upload.

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
- `CERTIFICATE_PASSWORD`
- `DEVELOPER_ID_APPLICATION_P12_BASE64`
- `DEVELOPER_ID_INSTALLER_P12_BASE64`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`

Sparkle keys sign app updates and do not require Apple Developer Program
membership. The Homebrew tap deploy key updates the external tap repository
without requiring a broad personal access token.

The Sparkle keys were generated with the keychain account
`gormanity.ytm-enhancer.menu-bar`.

Direct packages require `SPARKLE_PUBLIC_ED_KEY`. Plain local app builds created
without that environment variable disable Sparkle and show an "Updates
Unavailable" state in `About YTM Menu Bar` instead of embedding a placeholder
key.

The Developer ID `.p12` secrets import the Application and Installer signing
identities into the release runner. `CERTIFICATE_PASSWORD` is the password used
when exporting those `.p12` files from the login keychain.

`APP_STORE_CONNECT_PRIVATE_KEY_BASE64` is the base64-encoded App Store Connect
API `.p8` key. `APP_STORE_CONNECT_KEY_ID` is required. If the API key is a team
key, also set `APP_STORE_CONNECT_ISSUER_ID`; individual API keys should leave
that secret empty.

## Feed Strategy

Keep production and test feeds separate.

- Production direct builds use:

```text
https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml
```

- Local or beta update tests must use a separate appcast URL, such as a local
  HTTP server.
- Homebrew builds keep Sparkle disabled and must never consume an appcast.

Sparkle compares bundle versions. Public `menu-bar-vX.Y.Z` releases derive a
monotonic `CFBundleVersion` as `major * 1000000 + minor * 1000 + patch`; for
example, `menu-bar-v0.0.8` publishes build `8`. For every local update test,
increase `CFBundleVersion` even when `CFBundleShortVersionString` stays the
same.

The release scripts support local metadata overrides for update validation:

```sh
YTM_MENU_BAR_VERSION=0.1.1
YTM_MENU_BAR_BUILD_NUMBER=2
YTM_MENU_BAR_APPCAST_URL=http://127.0.0.1:8787/menu-bar/appcast.xml
```

These overrides affect generated app bundles, packages, casks, and appcasts.
They do not edit `apps/menu-bar/release/metadata.json` or
`apps/menu-bar/Sources/YTMMenuBarConnector/AppMetadata.swift`.

## Local Sparkle Update Test

Use this path to validate Sparkle updates without publishing fake GitHub
releases.

The reusable harness prepares the old package, newer update archive, local
appcast, release notes, and a `summary.json` with the exact commands to run:

```sh
pnpm run menu-bar:update-test:sparkle -- \
  --old-version=0.1.0 \
  --old-build=1 \
  --new-version=0.1.1 \
  --new-build=2 \
  --ed-key-file=sparkle_ed_private_key
```

It does not install or launch anything automatically. Run the printed commands
to serve the local feed, install the old package, open `About YTM Menu Bar`,
trigger the Sparkle update action, and verify the installed version after
relaunch.

The app bundle must embed the public key that matches the private signing key.
The harness reads `--public-ed-key`, `SPARKLE_PUBLIC_ED_KEY`, or the Sparkle
keychain account from `--key-account`.

1. Build the newer direct app with a local feed URL and higher build number.
2. Create the Sparkle `.zip` from the newer `.app`.
3. Sign the `.zip` with the local Sparkle private key.
4. Generate a local appcast with `--archive-url` pointing at the local `.zip`.
5. Build and install an older direct `.pkg` with the same local feed URL and a
   lower build number.
6. Serve the local appcast and `.zip` over HTTP.
7. Open `About YTM Menu Bar` in the older installed app.
8. Confirm the About window detects the update.
9. Confirm Sparkle downloads, verifies, installs, and relaunches the newer app.

Example local feed values:

```sh
export YTM_MENU_BAR_APPCAST_URL="http://127.0.0.1:8787/menu-bar/appcast.xml"
export SPARKLE_PUBLIC_ED_KEY="<public-ed-key>"
```

Build the newer update archive:

```sh
YTM_MENU_BAR_VERSION=0.1.1 YTM_MENU_BAR_BUILD_NUMBER=2 \
  pnpm run menu-bar:build:app -- \
  --channel=direct \
  --output=apps/menu-bar/.build/update-test/new

ditto -c -k --sequesterRsrc --keepParent \
  "apps/menu-bar/.build/update-test/new/direct/YTM Menu Bar.app" \
  apps/menu-bar/.build/update-test/feed/YTM-Menu-Bar-0.1.1.zip
```

Sign the archive with Sparkle:

```sh
apps/menu-bar/.build/artifacts/sparkle/Sparkle/bin/sign_update \
  --ed-key-file sparkle_ed_private_key \
  apps/menu-bar/.build/update-test/feed/YTM-Menu-Bar-0.1.1.zip
```

Generate the local appcast using the printed `sparkle:edSignature`:

```sh
YTM_MENU_BAR_VERSION=0.1.1 YTM_MENU_BAR_BUILD_NUMBER=2 \
  pnpm run menu-bar:appcast -- \
  --archive=apps/menu-bar/.build/update-test/feed/YTM-Menu-Bar-0.1.1.zip \
  --archive-url=http://127.0.0.1:8787/YTM-Menu-Bar-0.1.1.zip \
  --ed-signature=<sparkle-ed-signature> \
  --release-notes-url=http://127.0.0.1:8787/release-notes.html \
  --output=apps/menu-bar/.build/update-test/feed/menu-bar/appcast.xml
```

Build and install the older package:

```sh
YTM_MENU_BAR_VERSION=0.1.0 YTM_MENU_BAR_BUILD_NUMBER=1 \
  pnpm run menu-bar:package:direct
```

Serve the local feed:

```sh
python3 -m http.server 8787 \
  --directory apps/menu-bar/.build/update-test/feed
```

Then install the older `.pkg`, launch the app from `/Applications`, and open
`About YTM Menu Bar` to run the update.

## Local Homebrew Update Test

Use a temporary local tap with `file://` package URLs to validate the Homebrew
path without publishing fake releases.

The reusable harness prepares old and new packages, creates a git-backed local
tap, and writes a `summary.json` with the install, promote, upgrade, verify, and
uninstall commands:

```sh
pnpm run menu-bar:update-test:homebrew -- \
  --old-version=0.1.0 \
  --old-build=1 \
  --new-version=0.1.1 \
  --new-build=2
```

It does not run `brew install`, `brew upgrade`, or `brew uninstall`
automatically. Run the printed commands on a test machine or macOS runner.

1. Build a Homebrew package with a lower build number.
2. Generate a cask pointing at that package.
3. Install from the temporary tap.
4. Build a Homebrew package with a higher build number.
5. Regenerate the cask for the newer package.
6. Run `brew update` and `brew upgrade --cask ytm-menu-bar`.
7. Confirm the app updates and Sparkle remains disabled.

## CI Update Path Tests

`.github/workflows/menu-bar-update-path.yml` runs macOS update-path checks for
pull requests, pushes to `main`, and manual dispatches when menu bar release
files change.

Sparkle CI:

- Generates a throwaway Sparkle EdDSA key on the runner.
- Prepares an older direct package and newer signed update archive.
- Serves the local appcast, archive, and release notes over HTTP.
- Verifies appcast version metadata, archive reachability, checksum/signature
  presence, and old package installation.

The in-app Sparkle relaunch flow is still covered by manual acceptance because
it requires interactive macOS update UI.

Homebrew CI:

- Creates a temporary local git-backed tap with `file://` package URLs.
- Installs the older cask through Homebrew.
- Promotes the tap to the newer cask.
- Runs `brew update` and `brew upgrade --cask ytm-menu-bar`.
- Verifies the installed app version and uninstalls the cask.

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
   - signed, notarized, and stapled direct `.pkg`
   - signed, notarized, and stapled Homebrew `.pkg`
   - Sparkle `.zip` generated from the notarized and stapled direct `.app`
   - `appcast.xml`
   - standalone release notes at `menu-bar/release-notes/X.Y.Z.html`
   - install landing page at `menu-bar/install.html`
7. Confirm GitHub Pages serves the updated install page, appcast, and release
   notes. The appcast must link to the standalone release notes, not a full
   GitHub release page.
8. Confirm the Homebrew tap cask was updated.

The release workflow derives package, appcast, and cask versions from the
`menu-bar-vX.Y.Z` tag. Use a lower numeric tag, such as `menu-bar-v0.0.1`, for a
throwaway release dry run rather than a suffix tag such as
`menu-bar-v0.1.0-test`.

The workflow also publishes a stable install landing page at:

```text
https://gormanity.github.io/ytm-enhancer/menu-bar/install.html
```

The Connected Apps popup links to this page rather than the generic GitHub
Releases listing. The page is generated from the release metadata so direct
download, Homebrew, setup, update, privacy, and macOS security guidance stay
aligned with the current menu bar release.

## Manual Validation Policy

CI update-path tests are the routine regression gate for menu bar packaging,
appcast generation, and Homebrew cask updates. Manual validation is reserved for
cases where the user-session behavior matters.

Manual validation is required:

- Before the first public menu bar release.
- When release plumbing changes, including package generation, appcast
  generation, Sparkle signing, GitHub Pages deployment, Homebrew cask
  generation, native host manifest paths, signing, or notarization.
- When connector or native messaging behavior changes, including host names,
  connector handshake, permissions, lifecycle, command routing, or installed app
  connection behavior.

Manual validation is optional:

- For ordinary app-only releases when CI update-path tests pass and the release
  does not change packaging, updater, native host, or connector behavior.

When manual validation is required, the release cutter must tell the user why it
is required, provide the relevant checklist below, and wait for the user to
confirm completion before creating or pushing the public release tag.

## Manual Acceptance

Direct install:

- Install the `.pkg` on a clean macOS account.
- Confirm macOS accepts the Developer ID signed and notarized installer without
  the unidentified developer warning.
- Confirm `/Applications/YTM Menu Bar.app` exists.
- Confirm native host manifests exist under `/Library`.
- Open `YTM Menu Bar.app` directly and confirm it shows a single waiting menu
  bar item.
- Enable Connected Apps in the extension.
- Confirm no duplicate menu bar item appears.
- Confirm playback state and controls work.
- Confirm `About YTM Menu Bar` can reach the appcast and presents the Sparkle
  update action when an update is available.

When testing a direct package with the local dev extension, install user-local
developer manifests that point at the installed app before checking connector
behavior:

```sh
YTM_ENHANCER_NATIVE_HOST_PATH="/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector" \
  apps/menu-bar/scripts/install-native-hosts.sh
```

This is only a development override. Public direct-install users should rely on
the production native host manifests installed under `/Library`.

Homebrew install:

- Install with:

```sh
brew install --cask gormanity/tap/ytm-menu-bar
```

- Confirm the app connects to the extension.
- Confirm the app shows Homebrew update guidance instead of Sparkle updates.
- Confirm `brew upgrade --cask ytm-menu-bar` updates a test release.

Update path matrix:

- Fresh direct install to newer direct update.
- Older direct install to newer direct update.
- Direct beta or local feed build to newer beta or local feed build.
- Direct beta or local feed build to production feed build before release.
- Manual update from `About YTM Menu Bar`.
- Silent background update probe and About menu update-available label.
- App installed in `/Applications`.
- App installed in `~/Applications`.
- Homebrew package upgrade through `brew upgrade --cask ytm-menu-bar`.
