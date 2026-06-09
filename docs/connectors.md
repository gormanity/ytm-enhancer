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
- `track:read` allows track metadata such as title, artist, album, year, and
  artwork.

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

No transport is implemented yet. The host exposes a `ConnectorTransport`
interface with `start`, `stop`, and `send` methods so a future transport can be
attached without changing the protocol or playback routing.

Transport design still needs a browser-specific decision. Candidate transports
include native messaging for a native menu bar application, extension runtime
messaging for another extension, or a constrained browser-local bridge. Any
transport must preserve the host validation path.

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

1. Choose the transport for a native menu bar app, likely browser native
   messaging.
2. Implement the transport adapter behind `ConnectorTransport`.
3. Add a pairing or allow-list model for first-party and third-party clients.
4. Build the menu bar app in `apps/menu-bar` against
   `@ytm-enhancer/connector-protocol`.
5. Add integration tests for connection lifecycle and transport failures.
