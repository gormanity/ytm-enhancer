# Menu Bar Connector

This is the first-party macOS menu bar connector for YTM Enhancer.

The app is a native Swift/AppKit executable that communicates with the browser
extension through native messaging. It speaks the public connector protocol and
does not depend on extension internals.

## Current Scope

Implemented:

- Native macOS menu bar item.
- Current track title, artist, and progress display.
- Previous, play/pause, next, refresh, and quit menu actions.
- Native messaging stdio framing.
- Connector protocol handshake, playback subscription, state refresh, and
  playback actions.
- Local native host installer for Chrome, Chromium, Edge, and Firefox.

Not implemented yet:

- Packaged `.app` distribution.
- Signed installer.
- Automatic launch outside the browser native messaging host lifecycle.
- Artwork display.
- Seek controls.
- Diagnostics UI.

## Build

```sh
swift build --package-path apps/menu-bar -c release
```

The executable is written to:

```text
apps/menu-bar/.build/release/YTMMenuBarConnector
```

## Install Native Host Manifests

```sh
apps/menu-bar/scripts/install-native-hosts.sh
```

The script builds the release executable and writes browser native host
manifests under the current user's Library folder.

Before writing new manifests, it removes any existing manifests for the same
native host name. This prevents stale executable paths or extension allow-lists
from surviving across local installs.

For Chromium builds with a non-standard extension ID, provide a comma-separated
override:

```sh
YTM_ENHANCER_EXTENSION_ORIGINS="chrome-extension://<extension-id>/" \
  apps/menu-bar/scripts/install-native-hosts.sh
```

## Run

1. Build the extension.
2. Install the native host manifests.
3. Load the extension in the browser.
4. Open the popup.
5. Enable `Connected Apps`.

When connector support starts, the extension launches the native messaging host
and the menu bar item appears.

## Uninstall Native Host Manifests

```sh
apps/menu-bar/scripts/uninstall-native-hosts.sh
```

This removes the browser native host manifests created by the installer. It does
not remove Swift build output. To remove local build artifacts too:

```sh
rm -rf apps/menu-bar/.build
```

## Architecture Rules

- The app uses only native messaging and the connector protocol.
- The app does not inspect browser pages.
- The app does not import extension internals.
- All playback reads and commands route through the extension connector host.
