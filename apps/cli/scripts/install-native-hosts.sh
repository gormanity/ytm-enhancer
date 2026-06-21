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

build_binaries() {
  mkdir -p "$BUILD_DIR"
  go -C "$APP_ROOT" build -o "$BUILD_DIR/ytme" ./cmd/ytme
  go -C "$APP_ROOT" build -o "$BUILD_DIR/ytme-native-host" ./cmd/ytme-native-host
}

install_cli() {
  mkdir -p "$CLI_BIN_DIR"
  ln -sf "$BUILD_DIR/ytme" "$CLI_PATH"
  echo "Installed $CLI_PATH"
}

"$UNINSTALL_SCRIPT"

if [[ -z "${YTME_NATIVE_HOST_PATH:-}" ]]; then
  build_binaries
  install_cli
fi

if [[ ! -x "$NATIVE_HOST_PATH" ]]; then
  echo "Native host executable not found or not executable: $NATIVE_HOST_PATH" >&2
  exit 1
fi

write_chromium_manifest \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
write_chromium_manifest \
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
write_chromium_manifest \
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
write_firefox_manifest \
  "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"

echo "Enable Connected Apps in YTM Enhancer, then run: ytme doctor"

