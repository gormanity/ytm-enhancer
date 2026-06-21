# YTM Enhancer CLI

`ytme` is the first-party command-line Connected App for YTM Enhancer.

The CLI does not read YouTube Music pages, authenticate with YouTube, or play
audio directly. It talks to the YTM Enhancer browser extension through the same
connector protocol used by YTM Menu Bar.

## Commands

```sh
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
ytme doctor
```

## Local Development

Install the local native host manifests and the `ytme` command:

```sh
apps/cli/scripts/install-native-hosts.sh
```

Then open the extension popup, enable Connected Apps, and run:

```sh
ytme doctor
```

Uninstall the local CLI host and managed `ytme` symlink:

```sh
apps/cli/scripts/uninstall-native-hosts.sh
```

The scripts install `ytme` to `~/.local/bin` by default. Set `YTME_BIN_DIR` to
choose another directory.

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
Short-lived CLI commands fail clearly if the native host is not running.
