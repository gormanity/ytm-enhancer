#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.menu_bar"
DESCRIPTION="YTM Enhancer Menu Bar Connector"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="YTM Menu Bar"
LOCAL_APPLICATIONS_DIR="$HOME/Applications"
LOCAL_APP_PATH="${YTM_ENHANCER_LOCAL_APP_PATH:-$LOCAL_APPLICATIONS_DIR/$APP_NAME.app}"
LOCAL_APP_BUILD_ROOT="$APP_ROOT/.build/local-apps"
LOCAL_BUILT_APP_PATH="$LOCAL_APP_BUILD_ROOT/direct/$APP_NAME.app"
DEFAULT_BINARY_PATH="$LOCAL_APP_PATH/Contents/MacOS/YTMMenuBarConnector"
BINARY_PATH="${YTM_ENHANCER_NATIVE_HOST_PATH:-$DEFAULT_BINARY_PATH}"
UNINSTALL_SCRIPT="$APP_ROOT/scripts/uninstall-native-hosts.sh"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

CHROMIUM_ORIGINS=(
  "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/"
  "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/"
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/"
  "chrome-extension://gamefnibdabclmkngggcjghpbhjmajkm/"
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

install_local_app() {
  YTM_MENU_BAR_LOCAL_BUILD=1 node "$APP_ROOT/scripts/build-release-app.mjs" \
    --channel=direct \
    --output="$LOCAL_APP_BUILD_ROOT"

  if [[ ! -d "$LOCAL_BUILT_APP_PATH" ]]; then
    echo "Built app bundle not found: $LOCAL_BUILT_APP_PATH" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$LOCAL_APP_PATH")"
  rm -rf "$LOCAL_APP_PATH"
  cp -R "$LOCAL_BUILT_APP_PATH" "$LOCAL_APP_PATH"

  if [[ -x "$LSREGISTER" ]]; then
    "$LSREGISTER" -f "$LOCAL_APP_PATH" >/dev/null 2>&1 || true
  fi

  echo "Installed $LOCAL_APP_PATH"
}

cd "$APP_ROOT"
"$UNINSTALL_SCRIPT"

if [[ -z "${YTM_ENHANCER_NATIVE_HOST_PATH:-}" ]]; then
  install_local_app
fi

if [[ ! -x "$BINARY_PATH" ]]; then
  echo "Native host executable not found or not executable: $BINARY_PATH" >&2
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
