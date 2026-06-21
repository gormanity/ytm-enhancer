#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.cli"
DESCRIPTION="YTM Enhancer CLI Connector"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$APP_ROOT/.build/bin"
DEFAULT_NATIVE_HOST_PATH="$BUILD_DIR/ytme-native-host"
NATIVE_HOST_PATH="${YTME_NATIVE_HOST_PATH:-$DEFAULT_NATIVE_HOST_PATH}"
CLI_BIN_DIR="${YTME_BIN_DIR:-$HOME/.local/bin}"
CLI_PATH="$CLI_BIN_DIR/ytme"
UNINSTALL_SCRIPT="$APP_ROOT/scripts/uninstall-native-hosts.sh"
HOST_OS="${YTME_HOST_OS:-$(uname -s)}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

CHROMIUM_ORIGINS=(
  "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/"
  "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/"
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/"
  "chrome-extension://gamefnibdabclmkngggcjghpbhjmajkm/"
)
FIREFOX_EXTENSIONS=(
  "ytm-enhancer@gormanity"
)

if [[ -n "${YTME_EXTENSION_ORIGINS:-}" ]]; then
  IFS="," read -r -a CHROMIUM_ORIGINS <<<"$YTME_EXTENSION_ORIGINS"
fi

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf "%s" "$value"
}

json_array() {
  local first="true"
  printf "["
  for value in "$@"; do
    if [[ "$first" == "true" ]]; then
      first="false"
    else
      printf ", "
    fi
    printf "\"%s\"" "$(json_escape "$value")"
  done
  printf "]"
}

write_chromium_manifest() {
  local directory="$1"
  local manifest_path="$directory/$HOST_NAME.json"
  mkdir -p "$directory"
  cat >"$manifest_path" <<JSON
{
  "name": "$HOST_NAME",
  "description": "$DESCRIPTION",
  "path": "$(json_escape "$NATIVE_HOST_PATH")",
  "type": "stdio",
  "allowed_origins": $(json_array "${CHROMIUM_ORIGINS[@]}")
}
JSON
  echo "Installed $manifest_path"
}

write_firefox_manifest() {
  local directory="$1"
  local manifest_path="$directory/$HOST_NAME.json"
  mkdir -p "$directory"
  cat >"$manifest_path" <<JSON
{
  "name": "$HOST_NAME",
  "description": "$DESCRIPTION",
  "path": "$(json_escape "$NATIVE_HOST_PATH")",
  "type": "stdio",
  "allowed_extensions": $(json_array "${FIREFOX_EXTENSIONS[@]}")
}
JSON
  echo "Installed $manifest_path"
}

path_contains_dir() {
  local directory="$1"
  local path_entry
  local -a path_entries
  IFS=":" read -r -a path_entries <<<"${PATH:-}"
  for path_entry in "${path_entries[@]}"; do
    if [[ "$path_entry" == "$directory" ]]; then
      return 0
    fi
  done
  return 1
}

build_cli() {
  mkdir -p "$BUILD_DIR"
  go -C "$APP_ROOT" build -o "$BUILD_DIR/ytme" ./cmd/ytme
}

build_native_host() {
  mkdir -p "$BUILD_DIR"
  go -C "$APP_ROOT" build -o "$BUILD_DIR/ytme-native-host" ./cmd/ytme-native-host
}

install_cli() {
  mkdir -p "$CLI_BIN_DIR"
  ln -sf "$BUILD_DIR/ytme" "$CLI_PATH"
  echo "Installed $CLI_PATH"
}

print_next_steps() {
  echo "Enable Connected Apps in YTM Enhancer."
  if path_contains_dir "$CLI_BIN_DIR"; then
    echo "Then run: ytme doctor"
  else
    echo "Then run: $CLI_PATH doctor"
    echo "Add $CLI_BIN_DIR to PATH to run ytme directly."
  fi
}

install_native_hosts() {
  case "$HOST_OS" in
    Darwin)
      write_chromium_manifest \
        "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
      write_chromium_manifest \
        "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
      write_chromium_manifest \
        "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
      write_firefox_manifest \
        "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
      ;;
    Linux)
      write_chromium_manifest \
        "$XDG_CONFIG_HOME/google-chrome/NativeMessagingHosts"
      write_chromium_manifest \
        "$XDG_CONFIG_HOME/chromium/NativeMessagingHosts"
      write_chromium_manifest \
        "$XDG_CONFIG_HOME/microsoft-edge/NativeMessagingHosts"
      write_chromium_manifest \
        "$XDG_CONFIG_HOME/BraveSoftware/Brave-Browser/NativeMessagingHosts"
      write_firefox_manifest \
        "$HOME/.mozilla/native-messaging-hosts"
      ;;
    *)
      echo "Unsupported OS for native host installation: $HOST_OS" >&2
      exit 1
      ;;
  esac
}

"$UNINSTALL_SCRIPT"

build_cli
install_cli

if [[ -z "${YTME_NATIVE_HOST_PATH:-}" ]]; then
  build_native_host
fi

if [[ ! -x "$NATIVE_HOST_PATH" ]]; then
  echo "Native host executable not found or not executable: $NATIVE_HOST_PATH" >&2
  exit 1
fi

install_native_hosts

print_next_steps
