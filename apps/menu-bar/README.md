# Menu Bar Connector

This is the first-party macOS menu bar connector for YTM Enhancer.

The app is a native Swift/AppKit menu bar app that communicates with the browser
extension through native messaging. It speaks the public connector protocol and
does not depend on extension internals.

## Current Scope

Implemented:

- Native macOS menu bar playback surface.
- Current track title, artist, album, year, artwork, progress, and next track.
- Previous, play/pause, next, shuffle, repeat, seek, and focus actions.
- Native messaging stdio framing.
- Connector protocol handshake, playback subscription, state refresh, and
  playback actions.
- Local development native host installer for Chrome, Chromium, Edge, and
  Firefox.
- Release scaffolding for Developer ID signed and notarized app bundles and
  packages, Sparkle appcasts, and Homebrew cask generation.

Deferred:

- Publishing `menu-bar-v*` releases.
- Publishing the external `gormanity/homebrew-tap` repository.

## Development Build

```sh
swift build --package-path apps/menu-bar -c release
```

The development executable is written to:

```text
apps/menu-bar/.build/release/YTMMenuBarConnector
```

Bare local executable builds report a timestamped app version derived from the
executable modification time, with the current release base included, such as:

```text
2026.06.20.1405 (base v0.1.3)
```

Packaged direct and Homebrew builds continue to report their semantic bundle
version from `Info.plist`.

## Development Native Host Manifests

```sh
apps/menu-bar/scripts/install-native-hosts.sh
```

The development installer builds a local release-style app bundle, copies it to
`~/Applications/YTM Menu Bar.app`, and writes user-local browser native host
manifests under the current user's Library folder. The manifests point at:

```text
~/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector
```

Installing the local app bundle into `~/Applications` keeps local development
installs discoverable by Spotlight, Raycast, and other app launchers. Re-run the
installer after menu bar app changes to refresh the installed local bundle.

Before writing new manifests, it removes any existing manifests for the same
native host name. This prevents stale executable paths or extension allow-lists
from surviving across local installs.

For Chromium builds with a non-standard extension ID, provide a comma-separated
override:

```sh
YTM_ENHANCER_EXTENSION_ORIGINS="chrome-extension://<extension-id>/" \
  apps/menu-bar/scripts/install-native-hosts.sh
```

To test an installed release package against the local dev extension, point the
developer manifests at the installed app:

```sh
YTM_ENHANCER_NATIVE_HOST_PATH="/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector" \
  apps/menu-bar/scripts/install-native-hosts.sh
```

This writes user-local manifests that take precedence during development. The
public release package still installs production manifests under `/Library`.

## Release Channels

The public macOS connector has two supported install channels.

Direct install:

- Users install `YTM-Menu-Bar-<version>.pkg` from GitHub Releases.
- The package installs `/Applications/YTM Menu Bar.app`.
- The package installs `/Applications/YTM Menu Bar Uninstaller.command`.
- The package installs production native host manifests under `/Library` for
  Chrome, Chromium, Microsoft Edge, and Firefox.
- The app uses Sparkle from the `About YTM Menu Bar` window. It probes for
  updates silently and marks the About menu item when an update is available.
- Sparkle updates install the direct `.pkg` so app, native host manifests,
  package receipts, and uninstaller stay in sync.
- Releases are signed with Developer ID and notarized by Apple for distribution
  outside the Mac App Store.
- The Sparkle appcast lives at:

```text
https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml
```

To uninstall a direct install, double-click:

```text
/Applications/YTM Menu Bar Uninstaller.command
```

The uninstaller removes the app, production native host manifests, package
receipts, and development manifest overrides for the current user. It does not
remove extension settings; use Disable App in Connected Apps if you want to keep
YTM Menu Bar from reconnecting.

The Connected Apps popup can ask a connected YTM Menu Bar instance to start this
uninstall flow. The app still shows native confirmation and owns the direct vs.
Homebrew uninstall behavior.

Homebrew install:

```sh
brew install --cask gormanity/tap/ytm-menu-bar
```

- Users install `YTM-Menu-Bar-Homebrew-<version>.pkg`.
- The app is built with the Homebrew distribution channel.
- Sparkle is disabled for Homebrew builds.
- Updates are owned by Homebrew:

```sh
brew update && brew upgrade --cask ytm-menu-bar
```

## Release Build Scripts

Build a channel-specific `.app` bundle:

```sh
node apps/menu-bar/scripts/build-release-app.mjs --channel=direct
node apps/menu-bar/scripts/build-release-app.mjs --channel=homebrew
```

Build channel-specific `.pkg` installers:

```sh
node apps/menu-bar/scripts/package-release.mjs --channel=direct
node apps/menu-bar/scripts/package-release.mjs --channel=homebrew
```

Notarize and staple a signed release app or package:

```sh
node apps/menu-bar/scripts/notarize-release-artifact.mjs \
  --path="apps/menu-bar/.build/release-apps/direct/YTM Menu Bar.app"
```

Generate a Sparkle appcast after signing the direct update package:

```sh
node apps/menu-bar/scripts/generate-appcast.mjs \
  --archive=apps/menu-bar/.build/packages/YTM-Menu-Bar-0.1.0.pkg \
  --ed-signature=<sparkle-ed-signature>
```

Generate the Homebrew cask:

```sh
node apps/menu-bar/scripts/generate-homebrew-cask.mjs \
  --package=apps/menu-bar/.build/packages/YTM-Menu-Bar-Homebrew-0.1.0.pkg
```

Prepare local update path harnesses:

```sh
pnpm run menu-bar:update-test:sparkle -- \
  --old-version=0.1.0 \
  --old-build=1 \
  --new-version=0.1.1 \
  --new-build=2 \
  --ed-key-file=sparkle_ed_private_key

pnpm run menu-bar:update-test:homebrew -- \
  --old-version=0.1.0 \
  --old-build=1 \
  --new-version=0.1.1 \
  --new-build=2
```

## Run

1. Build the extension.
2. Install native host manifests.
3. Load the extension in the browser.
4. Open the popup.
5. Enable `Connected Apps`.

When connector support starts, the extension launches the native messaging host
and the menu bar item appears.

The app supports two launch paths:

- Opening `YTM Menu Bar.app` starts the menu bar UI and waits for YTM Enhancer.
- Enabling Connected Apps starts the browser native messaging host. If the UI is
  already open, the host runs headless and bridges into that UI instead of
  creating a duplicate menu bar item.

## Debug Logs

The app writes local diagnostic logs to:

```text
/tmp/ytm-menu-bar-connector.log
```

To follow connector activity while testing:

```sh
tail -f /tmp/ytm-menu-bar-connector.log
```

Set `YTM_MENU_BAR_LOG_PATH` before launching the host to write somewhere else.
Logs include native messaging lifecycle events, message types, request IDs, and
playback state summaries.

## Uninstall Development Manifests

```sh
apps/menu-bar/scripts/uninstall-native-hosts.sh
```

This removes the browser native host manifests and the
`~/Applications/YTM Menu Bar.app` bundle created by the development installer.
When that local app is running, the script stops only the process launched from
that exact bundle path, unregisters the bundle from Launch Services, and then
removes it. It does not remove `/Applications/YTM Menu Bar.app` or Swift build
output. To remove local build artifacts too:

```sh
rm -rf apps/menu-bar/.build
```

## Architecture Rules

- The app uses only native messaging and the connector protocol.
- The app does not inspect browser pages.
- The app does not import extension internals.
- All playback reads and commands route through the extension connector host.
