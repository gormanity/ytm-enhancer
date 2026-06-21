#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.cli"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$APP_ROOT/.build/bin"
CLI_BIN_DIR="${YTME_BIN_DIR:-$HOME/.local/bin}"
CLI_PATH="$CLI_BIN_DIR/ytme"
HOST_OS="${YTME_HOST_OS:-$(uname -s)}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

manifest_paths() {
  case "$HOST_OS" in
    Darwin)
      printf "%s\n" \
        "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json" \
        "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json" \
        "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$HOST_NAME.json" \
        "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/$HOST_NAME.json"
      ;;
    Linux)
      printf "%s\n" \
        "$XDG_CONFIG_HOME/google-chrome/NativeMessagingHosts/$HOST_NAME.json" \
        "$XDG_CONFIG_HOME/chromium/NativeMessagingHosts/$HOST_NAME.json" \
        "$XDG_CONFIG_HOME/microsoft-edge/NativeMessagingHosts/$HOST_NAME.json" \
        "$XDG_CONFIG_HOME/BraveSoftware/Brave-Browser/NativeMessagingHosts/$HOST_NAME.json" \
        "$HOME/.mozilla/native-messaging-hosts/$HOST_NAME.json"
      ;;
    *)
      echo "Unsupported OS for native host removal: $HOST_OS" >&2
      exit 1
      ;;
  esac
}

while IFS= read -r manifest_path; do
  if [[ -e "$manifest_path" ]]; then
    rm -f "$manifest_path"
    echo "Removed $manifest_path"
  else
    echo "Manifest not found: $manifest_path"
  fi
done < <(manifest_paths)

if [[ -L "$CLI_PATH" && "$(readlink "$CLI_PATH")" == "$BUILD_DIR/ytme" ]]; then
  rm -f "$CLI_PATH"
  echo "Removed $CLI_PATH"
elif [[ -e "$CLI_PATH" ]]; then
  echo "Kept $CLI_PATH because it is not managed by this script"
else
  echo "CLI link not found: $CLI_PATH"
fi

if [[ "${YTME_KEEP_BUILD:-0}" != "1" && -d "$BUILD_DIR" ]]; then
  rm -rf "$BUILD_DIR"
  echo "Removed $BUILD_DIR"
fi
