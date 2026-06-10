#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.menu_bar"
DESCRIPTION="YTM Enhancer Menu Bar Connector"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARY_PATH="$APP_ROOT/.build/release/YTMMenuBarConnector"

CHROMIUM_ORIGINS=(
  "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/"
  "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/"
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/"
)
FIREFOX_EXTENSIONS=(
  "ytm-enhancer@gormanity"
)

if [[ -n "${YTM_ENHANCER_EXTENSION_ORIGINS:-}" ]]; then
  IFS="," read -r -a CHROMIUM_ORIGINS <<<"$YTM_ENHANCER_EXTENSION_ORIGINS"
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
  "path": "$(json_escape "$BINARY_PATH")",
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
  "path": "$(json_escape "$BINARY_PATH")",
  "type": "stdio",
  "allowed_extensions": $(json_array "${FIREFOX_EXTENSIONS[@]}")
}
JSON
  echo "Installed $manifest_path"
}

cd "$APP_ROOT"
swift build -c release

write_chromium_manifest \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
write_chromium_manifest \
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
write_chromium_manifest \
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
write_firefox_manifest \
  "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
