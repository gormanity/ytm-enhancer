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
- `listTabs()` for aggregate diagnostics about whether YouTube Music tabs are
  currently known to the extension.

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
  It also allows aggregate YouTube Music tab diagnostics, such as whether a tab
  is currently detected and whether a selected tab is known.

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

The first transport is browser native messaging for first-party native apps. The
extension-side adapter lives behind the `ConnectorTransport` interface, so
protocol validation and playback routing still flow through the connector host.

Current first-party native messaging host names are:

```text
com.gormanity.ytm_enhancer.menu_bar
com.gormanity.ytm_enhancer.cli
com.gormanity.ytm_enhancer.tray
```

The background service worker attaches the transport only when Connected Apps is
enabled. When connector support is disabled, the host is not created and the
native messaging connection is not opened.

Browsers do not expose a native-host installation query. The extension infers
first-party install state from the native messaging startup path instead:
successful `connectNative()` startup marks a first-party app as available, and
browser-reported startup or disconnect failures mark it as missing or needing
attention in the Connected Apps page. These diagnostics are intentionally
transient and are not part of the connector protocol.

Future transports, such as extension runtime messaging for another extension or
a constrained browser-local bridge, must preserve the same host validation path.

## Browser Support

Connected Apps support depends on the browser extension, the browser's native
messaging implementation, and the first-party app installer.

| App              | Platform    | Supported Browsers                               | Automated Connector Smoke                 |
| ---------------- | ----------- | ------------------------------------------------ | ----------------------------------------- |
| YTM Menu Bar     | macOS       | Chrome, Chromium, Microsoft Edge, Firefox        | Chromium/Edge buttons; Firefox connection |
| YTM Enhancer CLI | macOS/Linux | Chrome, Chromium, Microsoft Edge, Firefox, Brave | Chromium and Firefox                      |
| YTM Tray         | Windows     | Chrome, Microsoft Edge                           | Microsoft Edge                            |

Firefox native messaging support is implemented for macOS and Linux installers
through `allowed_extensions` manifests for `ytm-enhancer@gormanity`, with
automated smoke coverage for the YTM Menu Bar native-host connection on macOS
and the CLI connector on macOS/Linux. The Windows tray installer does not
register a Firefox native messaging host yet, so Firefox on Windows is not
supported by YTM Tray.

## Repository Layout

```text
packages/
  connector-protocol/

apps/
  cli/
  menu-bar/
  windows-tray/

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

Connected Apps may request that a connected app begin its native uninstall flow.
The browser extension must not run uninstall commands itself. The native app
owns user confirmation, install-channel-specific behavior, elevated permissions,
and shutdown.

## CLI Connector

The first-party command-line connector lives in `apps/cli`. It is a Go app with
two binaries:

- `ytme-native-host`, launched by the browser through native messaging.
- `ytme`, a short-lived user-facing CLI that talks to the native host through a
  private local Unix socket.

The CLI uses the same connector protocol as YTM Menu Bar. It does not read
YouTube Music pages, authenticate with YouTube, or play audio directly. The
browser extension remains the source of playback state and command routing.
Because browsers own native messaging startup, `ytme daemon start` does not
launch the native host directly. If `ytme daemon stop` was used, reconnect the
CLI from the Connected Apps card so the extension can ask the browser to start
the native host again.

Initial local development commands are:

```sh
apps/cli/scripts/install-native-hosts.sh
ytme doctor
apps/cli/scripts/uninstall-native-hosts.sh
```

The Connected Apps popup links users to the stable CLI install page:

```text
https://gormanity.github.io/ytm-enhancer/cli/
```

The installer prints the exact `ytme doctor` command to run. It installs `ytme`
to `~/.local/bin` by default, but prints the full path when that directory is
not on `PATH`. The local installer supports macOS and Linux user-level native
messaging manifests. On Linux it writes manifests for Google Chrome, Chromium,
Microsoft Edge, Brave, and Firefox.

The `ytme` command supports playback status, JSON status output, play/pause,
previous/next, seek, shuffle, repeat, focus, watch mode, and diagnostics. Watch
mode renders a live terminal status with a progress bar by default, with
line-oriented output, newline-delimited JSON, custom polling intervals, and
bounded `--count` runs available for automation. Homebrew packaging and public
CLI release automation are intentionally left for a later release slice.

## Windows Tray Connector

The first-party Windows tray connector lives in `apps/windows-tray`. It is a
modern .NET WinForms tray app that communicates with the extension through
native messaging. It mirrors the macOS menu bar connector's user-facing role on
Windows: current playback status, tray/menu controls, focus YouTube Music, and
connection diagnostics. Direct release installs can check GitHub component
releases in the background, verify the runtime package checksum, and hand off to
the packaged installer after user confirmation.

The Windows tray app is separate from the CLI. Windows users get a native tray
surface; PowerShell or WSL CLI support is intentionally not part of the Windows
Connected Apps scope.

The Connected Apps popup links users to the stable Windows install page:

```text
https://gormanity.github.io/ytm-enhancer/windows-tray/install.html
```

Initial local development commands are:

```powershell
dotnet run --project apps/windows-tray/tests/YTMTray.Tests/YTMTray.Tests.csproj
apps/windows-tray/scripts/install-native-hosts.ps1
apps/windows-tray/scripts/uninstall-native-hosts.ps1
```

The local installer publishes a self-contained `YTMTray.exe` plus
`YTMTray.NativeHost.exe`, writes a native messaging manifest that points at the
native-host relay under `%LOCALAPPDATA%\YTM Enhancer\Tray`, and registers
user-level native messaging keys for Google Chrome and Microsoft Edge. Firefox
on Windows is not supported by YTM Tray yet.

Remaining work before a public connector release:

1. Publish the `gormanity/homebrew-tap` cask repository.
2. Add a clearer approval flow for newly seen connectors.
3. Add connector-facing diagnostics for protocol mismatches and permission
   denials.
