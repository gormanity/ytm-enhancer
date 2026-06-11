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

Remaining work:

1. Package the connector as a signed `.app`.
2. Replace the development native host installer with a signed installer.
3. Add a clearer approval flow for newly seen connectors.
4. Add diagnostics for native host launch failures and disconnected hosts.
5. Add connector-facing diagnostics for protocol mismatches and permission
   denials.
