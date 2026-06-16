# Connector Architecture

YTM Enhancer connectors are optional external clients for a versioned public
API. They are isolated from extension internals and from the YouTube Music DOM.

The extension remains browser-first, privacy-focused, modular, lightweight, and
independent of external services. Connector support must not change behavior
when no connector exists, connector support is disabled, or a connector fails.

## Shape

```text
feature modules
  -> centralized extension APIs
  -> connector host
  -> connector transport
  -> connector application
```

The connector host is the only extension-side boundary that external
applications may use. It consumes the same centralized APIs that modules already
use, rather than reaching into feature modules directly.

The first implementation exposes playback through `YtmRuntimeClient`:

- `getPlaybackState()` for current playback and track state.
- `executePlaybackAction()` for play, pause, next, previous, shuffle, repeat,
  and toggle play.
- `seekTo()` for timeline control.
- `focusTab()` for bringing the active YouTube Music tab/window forward.

Future connector API slices should follow the same rule: expose a narrow public
surface through the host only after a centralized extension API exists.

## Protocol Package

The connector protocol lives in `packages/connector-protocol`. It is separate
from `src/` so first-party connectors can import it without importing extension
internals, and so third-party connectors can consume the same contract from an
external repository later.

The package defines:

- The current protocol version.
- Supported permissions.
- Inbound connector messages.
- Outbound host messages and events.
- Runtime validators for manifests and messages.

The initial protocol version is `1.0.0`.

## Permissions

The first permission set is intentionally small:

- `playback:read` allows reading playback progress and player state.
- `playback:control` allows playback commands and seeking.
- `track:read` allows track metadata such as title, artist, album, year,
  artwork, and upcoming next-track metadata.
- `ytm:focus` allows a connector to focus the active YouTube Music tab/window.

The host rejects unknown permissions during `connector.hello`. If a connector
has `playback:read` but not `track:read`, playback state is still available, but
track metadata is redacted.

## Host

`createConnectorHost()` lives in `src/core/connectors`. The host:

- Is disabled by default.
- Validates message schemas before routing.
- Validates protocol versions during `connector.hello`.
- Validates requested permissions before each routed command.
- Keeps connector sessions separate from feature modules.
- Converts extension playback state into protocol playback state.
- Catches connector routing failures and returns protocol errors.

The background service worker does not create the host unless persisted state
has `connectors.enabled` set to `true`. Disabled connector support has no host
object, no transport listener, and no connector sessions.

Users manage this state from the popup's Connected Apps page. The page behaves
like the module pages in the sidebar, but it is backed by the core connector
subsystem rather than a `FeatureModule`.

Use "Connected Apps" for user-facing copy. Keep "connector" for protocol,
source, and architecture docs where the stable public API boundary matters. The
popup keeps the first-party YTM Menu Bar app discoverable even before it is
registered, and treats the registered connector list as the approval and
lifecycle control surface.

## Transport

The first transport is browser native messaging for the first-party macOS menu
bar app. The extension-side adapter lives behind the `ConnectorTransport`
interface, so protocol validation and playback routing still flow through the
connector host.

The native messaging host name is:

```text
com.gormanity.ytm_enhancer.menu_bar
```

The background service worker attaches the transport only when Connected Apps is
enabled. When connector support is disabled, the host is not created and the
native messaging connection is not opened.

Browsers do not expose a native-host installation query. The extension infers
first-party install state from the native messaging startup path instead:
successful `connectNative()` startup marks YTM Menu Bar as available, and
browser-reported startup or disconnect failures mark it as missing or needing
attention in the Connected Apps page. These diagnostics are intentionally
transient and are not part of the connector protocol.

Future transports, such as extension runtime messaging for another extension or
a constrained browser-local bridge, must preserve the same host validation path.

## Repository Layout

```text
packages/
  connector-protocol/

apps/
  menu-bar/

src/
  core/
    connectors/

docs/
  connectors.md
```

The existing extension still lives under `src/`. Moving it to an `extension/`
package would be a larger monorepo refactor and is not part of this slice.

## Menu Bar Connector Next Steps

The first-party macOS menu bar connector lives in `apps/menu-bar`. It is a
native Swift/AppKit executable that communicates with the extension through
native messaging. It displays current playback information and exposes basic
playback controls.

The public release model has two install channels:

- Direct install from GitHub Releases with a Developer ID signed and notarized
  `.pkg`.
- Homebrew install from `gormanity/homebrew-tap` with a cask named
  `ytm-menu-bar`.

The Connected Apps popup links users to the stable install page:

```text
https://gormanity.github.io/ytm-enhancer/menu-bar/install.html
```

That page presents the direct package download, the Homebrew install command,
setup guidance, update guidance, and macOS security notes for the current menu
bar release.

Direct installs are updated by the app through Sparkle. The stable appcast URL
is:

```text
https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml
```

Homebrew installs are updated by Homebrew. Homebrew builds keep Sparkle disabled
and direct users to:

```sh
brew update && brew upgrade --cask ytm-menu-bar
```

The extension does not download or install native binaries. The Connected Apps
page may link to install and update instructions, but native app distribution,
native host manifest installation, signing, notarization, and updates are owned
by the menu bar app release channel.

Remaining work before a public connector release:

1. Publish the `menu-bar-v*` GitHub Release workflow.
2. Publish the `gormanity/homebrew-tap` cask repository.
3. Add a clearer approval flow for newly seen connectors.
4. Add connector-facing diagnostics for protocol mismatches and permission
   denials.
