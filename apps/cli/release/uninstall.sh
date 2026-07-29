#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.cli"
MARKER_NAME=".ytm-enhancer-cli-managed"
MARKER_CONTENT="com.gormanity.ytm-enhancer.cli:managed-install:v1"
STATE_NAME=".install-state"
SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="$SCRIPT_DIR"
HOME_ROOT="${HOME:-}"
if [[ "$HOME_ROOT" != "/" ]]; then
  HOME_ROOT="${HOME_ROOT%/}"
fi
MARKER_PATH="$INSTALL_ROOT/$MARKER_NAME"
STATE_PATH="$INSTALL_ROOT/$STATE_NAME"
CLI_PATH=""
NATIVE_HOST_PATH=""
RECORDED_INSTALL_ROOT=""
RUNTIME=""
STATE_VERSION=""
APP_ID=""
MANIFEST_PATHS=()
SEEN_STATE_VERSION=0
SEEN_APP_ID=0
SEEN_RUNTIME=0
SEEN_CLI_PATH=0
SEEN_NATIVE_HOST_PATH=0

fail() {
  echo "$*" >&2
  exit 1
}

contains_control_path_character() {
  local value="$1"
  [[ "$value" == *$'\n'* || "$value" == *$'\r'* || "$value" == *$'\t'* ]]
}

require_safe_recorded_path() {
  local label="$1"
  local path="$2"

  [[ -n "$path" && "$path" == /* ]] ||
    fail "Managed $label is not an absolute path."
  contains_control_path_character "$path" &&
    fail "Managed $label contains an unsupported control character."
  case "$path" in
    "/" | */../* | */.. | */./* | */.)
      fail "Managed $label is unsafe: $path"
      ;;
  esac
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf "%s" "$value"
}

[[ "$INSTALL_ROOT" != "/" && "$INSTALL_ROOT" != "$HOME_ROOT" ]] ||
  fail "Refusing to uninstall from an unsafe install root."
[[ -f "$MARKER_PATH" && ! -L "$MARKER_PATH" ]] ||
  fail "Managed install marker is missing: $MARKER_PATH"
[[ "$(cat "$MARKER_PATH")" == "$MARKER_CONTENT" ]] ||
  fail "Managed install marker is invalid."
[[ -f "$STATE_PATH" && ! -L "$STATE_PATH" ]] ||
  fail "Managed install state is missing: $STATE_PATH"
[[ -f "$INSTALL_ROOT/RUNTIME" && ! -L "$INSTALL_ROOT/RUNTIME" ]] ||
  fail "Managed install runtime marker is missing."

while IFS= read -r line || [[ -n "$line" ]]; do
  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    state_version)
      [[ "$SEEN_STATE_VERSION" == "0" ]] ||
        fail "Managed install state contains duplicate state_version."
      SEEN_STATE_VERSION=1
      STATE_VERSION="$value"
      ;;
    app_id)
      [[ "$SEEN_APP_ID" == "0" ]] ||
        fail "Managed install state contains duplicate app_id."
      SEEN_APP_ID=1
      APP_ID="$value"
      ;;
    runtime)
      [[ "$SEEN_RUNTIME" == "0" ]] ||
        fail "Managed install state contains duplicate runtime."
      SEEN_RUNTIME=1
      RUNTIME="$value"
      ;;
    cli_path)
      [[ "$SEEN_CLI_PATH" == "0" ]] ||
        fail "Managed install state contains duplicate cli_path."
      SEEN_CLI_PATH=1
      CLI_PATH="$value"
      ;;
    native_host_path)
      [[ "$SEEN_NATIVE_HOST_PATH" == "0" ]] ||
        fail "Managed install state contains duplicate native_host_path."
      SEEN_NATIVE_HOST_PATH=1
      NATIVE_HOST_PATH="$value"
      ;;
    manifest_path)
      MANIFEST_PATHS[${#MANIFEST_PATHS[@]}]="$value"
      ;;
    *)
      fail "Managed install state contains an unknown key: $key"
      ;;
  esac
done <"$STATE_PATH"

[[ "$STATE_VERSION" == "1" ]] || fail "Unsupported managed install state."
[[ "$APP_ID" == "com.gormanity.ytm-enhancer.cli" ]] ||
  fail "Managed install state belongs to another application."
case "$RUNTIME" in
  macos-x64 | macos-arm64 | linux-x64 | linux-arm64) ;;
  *) fail "Managed install runtime is invalid: $RUNTIME" ;;
esac
[[ "$(cat "$INSTALL_ROOT/RUNTIME")" == "$RUNTIME" ]] ||
  fail "Managed install runtime marker does not match its state."

require_safe_recorded_path "CLI path" "$CLI_PATH"
require_safe_recorded_path "native host path" "$NATIVE_HOST_PATH"
case "$NATIVE_HOST_PATH" in
  */bin/ytme-native-host)
    RECORDED_INSTALL_ROOT="${NATIVE_HOST_PATH%/bin/ytme-native-host}"
    ;;
  *)
    fail "Managed native host path does not identify the installed host."
    ;;
esac
[[ -d "$RECORDED_INSTALL_ROOT" ]] ||
  fail "Managed native host path does not identify this install root."
[[ "$(cd -P "$RECORDED_INSTALL_ROOT" && pwd)" == "$INSTALL_ROOT" ]] ||
  fail "Managed native host path does not belong to this install root."
[[ "${#MANIFEST_PATHS[@]}" -eq 5 ]] ||
  fail "Managed install state has an unexpected manifest count."

for manifest_path in "${MANIFEST_PATHS[@]}"; do
  require_safe_recorded_path "manifest path" "$manifest_path"
  case "$manifest_path" in
    */NativeMessagingHosts/"$HOST_NAME.json" | \
      */native-messaging-hosts/"$HOST_NAME.json") ;;
    *) fail "Managed manifest path is outside a native messaging directory." ;;
  esac
done

if [[ -x "$INSTALL_ROOT/bin/ytme" ]]; then
  "$INSTALL_ROOT/bin/ytme" daemon stop >/dev/null 2>&1 || true
fi

expected_manifest_path="\"path\": \"$(json_escape "$NATIVE_HOST_PATH")\""
for manifest_path in "${MANIFEST_PATHS[@]}"; do
  if [[
    -f "$manifest_path" &&
      ! -L "$manifest_path" &&
      $(grep -Fc "$expected_manifest_path" "$manifest_path" || true) -eq 1
  ]]; then
    rm -f "$manifest_path"
    echo "Removed $manifest_path"
  elif [[ -e "$manifest_path" || -L "$manifest_path" ]]; then
    echo "Kept unmanaged manifest: $manifest_path"
  fi
done

if [[
  -L "$CLI_PATH" &&
    "$(readlink "$CLI_PATH")" == "$RECORDED_INSTALL_ROOT/bin/ytme"
]]; then
  rm -f "$CLI_PATH"
  echo "Removed $CLI_PATH"
elif [[ -e "$CLI_PATH" || -L "$CLI_PATH" ]]; then
  echo "Kept unmanaged command: $CLI_PATH"
fi

rm -rf "$INSTALL_ROOT"
echo "Removed $INSTALL_ROOT"
