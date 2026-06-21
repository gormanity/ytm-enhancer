# YTM Enhancer CLI

`ytme` is the first-party command-line Connected App for YTM Enhancer.

The CLI does not read YouTube Music pages, authenticate with YouTube, or play
audio directly. It talks to the YTM Enhancer browser extension through the same
connector protocol used by YTM Menu Bar.

## Commands

```sh
ytme help
ytme --version
ytme status
ytme status --json
ytme now
ytme play
ytme pause
ytme toggle
ytme next
ytme prev
ytme previous
ytme seek 1:23
ytme seek +10
ytme seek -5
ytme shuffle
ytme repeat
ytme focus
ytme watch
ytme watch --lines
ytme watch --json --count 3
ytme doctor
ytme doctor --verbose
ytme daemon status
ytme daemon status --verbose
ytme daemon start
ytme daemon stop
```

`ytme daemon status` is equivalent to `ytme doctor`. `ytme daemon stop` asks the
native host to exit cleanly.

`ytme daemon start` verifies whether the native host is already running. If it
is not running, the command explains how to reconnect it from YTM Enhancer
because the browser extension owns native messaging startup.

`ytme doctor` reports a compact health summary using `OK`, `WARN`, and `INFO`
lines for the connector, YouTube Music tab detection, playback cache state, and
versions. Status labels are colorized in interactive terminals and remain plain
text when output is redirected or `NO_COLOR` is set. Use `ytme doctor --verbose`
for connector IDs, native host names, and lower-level protocol details.

`ytme watch` renders a live terminal status with the current track, a progress
bar, elapsed time, and total duration. When output is redirected, it falls back
to line-oriented updates for meaningful playback changes. Add `--lines` to force
line output, `--json` for newline-delimited JSON, `--interval 500ms` to adjust
polling, or `--count 3` to stop after a fixed number of rendered or emitted
updates.

## Local Development

Install the local native host manifests and the `ytme` command on macOS or
Linux:

```sh
apps/cli/scripts/install-native-hosts.sh
```

Then open the extension popup, enable Connected Apps, and run the command
printed by the installer, for example:

```sh
ytme doctor
```

Uninstall the local CLI host and managed `ytme` symlink:

```sh
apps/cli/scripts/uninstall-native-hosts.sh
```

The scripts install `ytme` to `~/.local/bin` by default. If that directory is
not on `PATH`, the installer prints the full command path to use instead. Set
`YTME_BIN_DIR` to choose another directory.

On Linux, the installer writes user-level native messaging manifests for Google
Chrome, Chromium, Microsoft Edge, Brave, and Firefox. Chromium-family manifests
use `${XDG_CONFIG_HOME:-~/.config}`. Firefox uses
`~/.mozilla/native-messaging-hosts`.

## Architecture

```text
ytme command
  -> local Unix socket
  -> ytme-native-host
  -> browser native messaging
  -> YTM Enhancer connector host
  -> centralized playback APIs
```

`ytme-native-host` is started by the browser when Connected Apps is enabled.
Short-lived CLI commands fail clearly if the native host is not running. If the
native host was stopped manually while Connected Apps remains enabled, use
Reconnect CLI from the CLI card in Connected Apps.
