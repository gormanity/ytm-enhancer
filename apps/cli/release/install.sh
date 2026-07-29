#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.cli"
DESCRIPTION="YTM Enhancer CLI Connector"
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_OS="${YTME_HOST_OS:-$(uname -s)}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
INSTALL_ROOT="${YTME_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/ytm-enhancer-cli}"
INSTALL_BIN_DIR="$INSTALL_ROOT/bin"
CLI_BIN_DIR="${YTME_BIN_DIR:-$HOME/.local/bin}"
CLI_PATH="$CLI_BIN_DIR/ytme"
NATIVE_HOST_PATH="$INSTALL_BIN_DIR/ytme-native-host"

CHROMIUM_ORIGINS=(
  "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/"
  "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/"
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/"
  "chrome-extension://gamefnibdabclmkngggcjghpbhjmajkm/"
)
FIREFOX_EXTENSIONS=("ytm-enhancer@gormanity")

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

require_package_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Package file is missing: $path" >&2
    exit 1
  fi
}

install_cli_link() {
  mkdir -p "$CLI_BIN_DIR"
  if [[ -e "$CLI_PATH" || -L "$CLI_PATH" ]]; then
    local current_target=""
    if [[ -L "$CLI_PATH" ]]; then
      current_target="$(readlink "$CLI_PATH")"
    fi
    if [[
      ! -L "$CLI_PATH" ||
        (
          "$current_target" != "$INSTALL_BIN_DIR/ytme" &&
          "$current_target" != */apps/cli/.build/bin/ytme
        )
    ]]; then
      echo "Refusing to replace unmanaged command: $CLI_PATH" >&2
      exit 1
    fi
    rm -f "$CLI_PATH"
  fi
  ln -s "$INSTALL_BIN_DIR/ytme" "$CLI_PATH"
  echo "Installed $CLI_PATH"
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

require_package_file "$PACKAGE_DIR/ytme"
require_package_file "$PACKAGE_DIR/ytme-native-host"
require_package_file "$PACKAGE_DIR/uninstall.sh"

mkdir -p "$INSTALL_BIN_DIR"
install -m 0755 "$PACKAGE_DIR/ytme" "$INSTALL_BIN_DIR/ytme"
install -m 0755 "$PACKAGE_DIR/ytme-native-host" "$NATIVE_HOST_PATH"
install -m 0755 "$PACKAGE_DIR/uninstall.sh" "$INSTALL_ROOT/uninstall.sh"
if [[ -f "$PACKAGE_DIR/VERSION" ]]; then
  install -m 0644 "$PACKAGE_DIR/VERSION" "$INSTALL_ROOT/VERSION"
fi
if [[ -f "$PACKAGE_DIR/LICENSE" ]]; then
  install -m 0644 "$PACKAGE_DIR/LICENSE" "$INSTALL_ROOT/LICENSE"
fi

install_cli_link
install_native_hosts

echo "Enable Connected Apps and YTM Enhancer CLI in the browser extension."
if path_contains_dir "$CLI_BIN_DIR"; then
  echo "Then run: ytme doctor"
else
  echo "Then run: $CLI_PATH doctor"
  echo "Add $CLI_BIN_DIR to PATH to run ytme directly."
fi
