#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.cli"
DESCRIPTION="YTM Enhancer CLI Connector"
MARKER_NAME=".ytm-enhancer-cli-managed"
MARKER_CONTENT="com.gormanity.ytm-enhancer.cli:managed-install:v1"
STATE_NAME=".install-state"
PACKAGE_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_OS="${YTME_HOST_OS:-$(uname -s)}"
HOST_ARCH="${YTME_HOST_ARCH:-$(uname -m)}"

if [[ -z "${HOME:-}" || "$HOME" != /* || "$HOME" == "/" ]]; then
  echo "HOME must be an absolute user home directory." >&2
  exit 1
fi
HOME_ROOT="${HOME%/}"

if [[ -n "${XDG_CONFIG_HOME:-}" && "$XDG_CONFIG_HOME" == /* ]]; then
  CONFIG_HOME="${XDG_CONFIG_HOME%/}"
else
  CONFIG_HOME="$HOME_ROOT/.config"
fi
if [[ -n "${XDG_DATA_HOME:-}" && "$XDG_DATA_HOME" == /* ]]; then
  DATA_HOME="${XDG_DATA_HOME%/}"
else
  DATA_HOME="$HOME_ROOT/.local/share"
fi

INSTALL_ROOT="${YTME_INSTALL_ROOT:-$DATA_HOME/ytm-enhancer-cli}"
INSTALL_ROOT="${INSTALL_ROOT%/}"
INSTALL_BIN_DIR="$INSTALL_ROOT/bin"
CLI_BIN_DIR="${YTME_BIN_DIR:-$HOME_ROOT/.local/bin}"
CLI_BIN_DIR="${CLI_BIN_DIR%/}"
CLI_PATH="$CLI_BIN_DIR/ytme"
NATIVE_HOST_PATH="$INSTALL_BIN_DIR/ytme-native-host"
MARKER_PATH="$INSTALL_ROOT/$MARKER_NAME"
STATE_PATH="$INSTALL_ROOT/$STATE_NAME"

CHROMIUM_ORIGINS=(
  "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/"
  "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/"
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/"
  "chrome-extension://gamefnibdabclmkngggcjghpbhjmajkm/"
)
FIREFOX_EXTENSIONS=("ytm-enhancer@gormanity")
MANIFEST_PATHS=()
MANIFEST_KINDS=()

if [[ -n "${YTME_EXTENSION_ORIGINS:-}" ]]; then
  IFS="," read -r -a CHROMIUM_ORIGINS <<<"$YTME_EXTENSION_ORIGINS"
fi

fail() {
  echo "$*" >&2
  exit 1
}

contains_control_path_character() {
  local value="$1"
  [[ "$value" == *$'\n'* || "$value" == *$'\r'* || "$value" == *$'\t'* ]]
}

require_safe_absolute_path() {
  local label="$1"
  local path="$2"

  [[ -n "$path" && "$path" == /* ]] ||
    fail "$label must be an absolute path: $path"
  contains_control_path_character "$path" &&
    fail "$label contains an unsupported control character."
  case "$path" in
    "/" | "$HOME_ROOT" | */../* | */.. | */./* | */.)
      fail "Refusing unsafe $label: $path"
      ;;
  esac
}

require_package_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] ||
    fail "Package file is missing or is not a regular file: $path"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf "%s" "$value"
}

json_array() {
  local first="true"
  local value
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

add_manifest() {
  local kind="$1"
  local path="$2"
  local index="${#MANIFEST_PATHS[@]}"
  MANIFEST_KINDS[index]="$kind"
  MANIFEST_PATHS[index]="$path"
}

configure_platform() {
  case "$HOST_OS:$HOST_ARCH" in
    Darwin:x86_64 | Darwin:amd64)
      EXPECTED_RUNTIME="macos-x64"
      ;;
    Darwin:arm64 | Darwin:aarch64)
      EXPECTED_RUNTIME="macos-arm64"
      ;;
    Linux:x86_64 | Linux:amd64)
      EXPECTED_RUNTIME="linux-x64"
      ;;
    Linux:arm64 | Linux:aarch64)
      EXPECTED_RUNTIME="linux-arm64"
      ;;
    Darwin:*)
      fail "Unsupported macOS architecture: $HOST_ARCH"
      ;;
    Linux:*)
      fail "Unsupported Linux architecture: $HOST_ARCH"
      ;;
    *)
      fail "Unsupported operating system for native host installation: $HOST_OS"
      ;;
  esac

  case "$HOST_OS" in
    Darwin)
      add_manifest chromium \
        "$HOME_ROOT/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest chromium \
        "$HOME_ROOT/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest chromium \
        "$HOME_ROOT/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest chromium \
        "$HOME_ROOT/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest firefox \
        "$HOME_ROOT/Library/Application Support/Mozilla/NativeMessagingHosts/$HOST_NAME.json"
      ;;
    Linux)
      add_manifest chromium \
        "$CONFIG_HOME/google-chrome/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest chromium \
        "$CONFIG_HOME/chromium/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest chromium \
        "$CONFIG_HOME/microsoft-edge/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest chromium \
        "$CONFIG_HOME/BraveSoftware/Brave-Browser/NativeMessagingHosts/$HOST_NAME.json"
      add_manifest firefox \
        "$HOME_ROOT/.mozilla/native-messaging-hosts/$HOST_NAME.json"
      ;;
  esac
}

manifest_is_replaceable() {
  local path="$1"
  local escaped_native_host
  escaped_native_host="$(json_escape "$NATIVE_HOST_PATH")"

  [[ -f "$path" && ! -L "$path" ]] || return 1
  grep -Fq "\"name\": \"$HOST_NAME\"" "$path" || return 1
  if grep -Fq "\"path\": \"$escaped_native_host\"" "$path"; then
    return 0
  fi
  grep -Fq "/apps/cli/.build/bin/ytme-native-host\"" "$path"
}

preflight_cli_link() {
  if [[ ! -e "$CLI_PATH" && ! -L "$CLI_PATH" ]]; then
    return
  fi
  [[ -L "$CLI_PATH" ]] ||
    fail "Refusing to replace unmanaged command: $CLI_PATH"
  local current_target
  current_target="$(readlink "$CLI_PATH")"
  if [[
    "$current_target" != "$INSTALL_BIN_DIR/ytme" &&
      "$current_target" != */apps/cli/.build/bin/ytme
  ]]; then
    fail "Refusing to replace unmanaged command: $CLI_PATH"
  fi
}

validate_existing_state() {
  local app_id=""
  local cli_path=""
  local existing_runtime=""
  local index
  local key
  local line
  local native_host_path=""
  local state_version=""
  local value
  local -a manifest_paths=()

  while IFS= read -r line || [[ -n "$line" ]]; do
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      state_version)
        [[ -z "$state_version" ]] ||
          fail "Managed install state contains duplicate state_version."
        state_version="$value"
        ;;
      app_id)
        [[ -z "$app_id" ]] ||
          fail "Managed install state contains duplicate app_id."
        app_id="$value"
        ;;
      runtime)
        [[ -z "$existing_runtime" ]] ||
          fail "Managed install state contains duplicate runtime."
        existing_runtime="$value"
        ;;
      cli_path)
        [[ -z "$cli_path" ]] ||
          fail "Managed install state contains duplicate cli_path."
        cli_path="$value"
        ;;
      native_host_path)
        [[ -z "$native_host_path" ]] ||
          fail "Managed install state contains duplicate native_host_path."
        native_host_path="$value"
        ;;
      manifest_path)
        manifest_paths[${#manifest_paths[@]}]="$value"
        ;;
      *)
        fail "Managed install state contains an unknown key: $key"
        ;;
    esac
  done <"$STATE_PATH"

  [[ "$state_version" == "1" ]] ||
    fail "Managed install state has an unsupported version."
  [[ "$app_id" == "com.gormanity.ytm-enhancer.cli" ]] ||
    fail "Managed install state belongs to another application."
  case "$existing_runtime" in
    macos-x64 | macos-arm64 | linux-x64 | linux-arm64) ;;
    *) fail "Managed install state has an invalid runtime." ;;
  esac
  [[ -f "$INSTALL_ROOT/RUNTIME" && ! -L "$INSTALL_ROOT/RUNTIME" ]] ||
    fail "Managed install runtime marker is missing."
  [[ "$(cat "$INSTALL_ROOT/RUNTIME")" == "$existing_runtime" ]] ||
    fail "Managed install runtime marker does not match its state."
  [[ "$cli_path" == "$CLI_PATH" ]] ||
    fail "Managed install uses another CLI path; uninstall it before moving."
  [[ "$native_host_path" == "$NATIVE_HOST_PATH" ]] ||
    fail "Managed install has an unexpected native host path."
  [[ "${#manifest_paths[@]}" -eq "${#MANIFEST_PATHS[@]}" ]] ||
    fail "Managed install state has an unexpected manifest count."
  index=0
  while [[ "$index" -lt "${#MANIFEST_PATHS[@]}" ]]; do
    [[ "${manifest_paths[$index]}" == "${MANIFEST_PATHS[$index]}" ]] ||
      fail "Managed install uses other manifest paths; uninstall it before moving."
    index=$((index + 1))
  done
}

preflight_install_root() {
  require_safe_absolute_path "install root" "$INSTALL_ROOT"
  require_safe_absolute_path "CLI binary directory" "$CLI_BIN_DIR"

  case "$PACKAGE_DIR" in
    "$INSTALL_ROOT" | "$INSTALL_ROOT"/*)
      fail "The release package cannot be located inside the install root."
      ;;
  esac
  case "$INSTALL_ROOT" in
    "$PACKAGE_DIR" | "$PACKAGE_DIR"/*)
      fail "The install root cannot be located inside the release package."
      ;;
  esac

  [[ ! -L "$INSTALL_ROOT" ]] ||
    fail "Refusing to install through a symlinked install root: $INSTALL_ROOT"
  if [[ -e "$INSTALL_ROOT" ]]; then
    [[ -d "$INSTALL_ROOT" ]] ||
      fail "Install root exists and is not a directory: $INSTALL_ROOT"
    [[ -f "$MARKER_PATH" && ! -L "$MARKER_PATH" ]] ||
      fail "Refusing to replace an unmanaged install root: $INSTALL_ROOT"
    [[ "$(cat "$MARKER_PATH")" == "$MARKER_CONTENT" ]] ||
      fail "Refusing to replace an install root with an invalid ownership marker."
    [[ -f "$STATE_PATH" && ! -L "$STATE_PATH" ]] ||
      fail "The managed install state is missing or invalid: $STATE_PATH"
    validate_existing_state
  fi
}

preflight_manifests() {
  local path
  for path in "${MANIFEST_PATHS[@]}"; do
    require_safe_absolute_path "native messaging manifest path" "$path"
    if [[ -e "$path" || -L "$path" ]]; then
      manifest_is_replaceable "$path" ||
        fail "Refusing to replace unmanaged native messaging manifest: $path"
    fi
  done
}

read_required_package_value() {
  local name="$1"
  local path="$PACKAGE_DIR/$name"
  require_package_file "$path"
  local value
  value="$(cat "$path")"
  [[ -n "$value" && "$value" != *$'\n'* && "$value" != *$'\r'* ]] ||
    fail "Package $name is empty or invalid."
  printf "%s" "$value"
}

write_chromium_manifest() {
  local path="$1"
  local temporary_path="$path.ytme-install.$$"
  mkdir -p "$(dirname "$path")"
  {
    printf '{\n'
    printf '  "name": "%s",\n' "$HOST_NAME"
    printf '  "description": "%s",\n' "$DESCRIPTION"
    printf '  "path": "%s",\n' "$(json_escape "$NATIVE_HOST_PATH")"
    printf '  "type": "stdio",\n'
    printf '  "allowed_origins": %s\n' \
      "$(json_array "${CHROMIUM_ORIGINS[@]}")"
    printf '}\n'
  } >"$temporary_path"
  chmod 0644 "$temporary_path"
  mv -f "$temporary_path" "$path"
}

write_firefox_manifest() {
  local path="$1"
  local temporary_path="$path.ytme-install.$$"
  mkdir -p "$(dirname "$path")"
  {
    printf '{\n'
    printf '  "name": "%s",\n' "$HOST_NAME"
    printf '  "description": "%s",\n' "$DESCRIPTION"
    printf '  "path": "%s",\n' "$(json_escape "$NATIVE_HOST_PATH")"
    printf '  "type": "stdio",\n'
    printf '  "allowed_extensions": %s\n' \
      "$(json_array "${FIREFOX_EXTENSIONS[@]}")"
    printf '}\n'
  } >"$temporary_path"
  chmod 0644 "$temporary_path"
  mv -f "$temporary_path" "$path"
}

write_state() {
  local destination="$1"
  local path
  {
    printf 'state_version=1\n'
    printf 'app_id=com.gormanity.ytm-enhancer.cli\n'
    printf 'runtime=%s\n' "$PACKAGE_RUNTIME"
    printf 'cli_path=%s\n' "$CLI_PATH"
    printf 'native_host_path=%s\n' "$NATIVE_HOST_PATH"
    for path in "${MANIFEST_PATHS[@]}"; do
      printf 'manifest_path=%s\n' "$path"
    done
  } >"$destination"
  chmod 0600 "$destination"
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

configure_platform
require_package_file "$PACKAGE_DIR/ytme"
require_package_file "$PACKAGE_DIR/ytme-native-host"
require_package_file "$PACKAGE_DIR/uninstall.sh"
require_package_file "$PACKAGE_DIR/LICENSE"
PACKAGE_VERSION="$(read_required_package_value VERSION)"
PACKAGE_RUNTIME="$(read_required_package_value RUNTIME)"
[[ "$PACKAGE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "Package VERSION is not a semantic version: $PACKAGE_VERSION"
[[ "$PACKAGE_RUNTIME" == "$EXPECTED_RUNTIME" ]] ||
  fail "This package targets $PACKAGE_RUNTIME, but this system requires $EXPECTED_RUNTIME."
preflight_install_root
preflight_cli_link
preflight_manifests

INSTALL_PARENT="$(dirname "$INSTALL_ROOT")"
mkdir -p "$INSTALL_PARENT"
TRANSACTION_ROOT="$(mktemp -d "$INSTALL_PARENT/.ytm-enhancer-cli-transaction.XXXXXX")"
STAGE_ROOT="$TRANSACTION_ROOT/new-install"
BACKUP_ROOT="$TRANSACTION_ROOT/previous-install"
TRANSACTION_ACTIVE=1
ROOT_SWITCHED=0
HAD_OLD_ROOT=0
HAD_CLI_LINK=0
OLD_CLI_TARGET=""
MANIFEST_EXISTED=()
MANIFEST_WRITTEN=()

rollback_install() {
  set +e
  local index path temporary_path

  if [[ -n "${CLI_LINK_TEMP:-}" ]]; then
    rm -f "$CLI_LINK_TEMP"
  fi
  if [[ "$ROOT_SWITCHED" == "1" && -e "$INSTALL_ROOT" ]]; then
    rm -rf "$INSTALL_ROOT"
  fi
  if [[ "$HAD_OLD_ROOT" == "1" && -d "$BACKUP_ROOT" ]]; then
    mv "$BACKUP_ROOT" "$INSTALL_ROOT"
  fi

  if [[ -L "$CLI_PATH" && "$(readlink "$CLI_PATH")" == "$INSTALL_BIN_DIR/ytme" ]]; then
    rm -f "$CLI_PATH"
  fi
  if [[ "$HAD_CLI_LINK" == "1" ]]; then
    mkdir -p "$CLI_BIN_DIR"
    ln -s "$OLD_CLI_TARGET" "$CLI_PATH"
  fi

  index=0
  while [[ "$index" -lt "${#MANIFEST_PATHS[@]}" ]]; do
    path="${MANIFEST_PATHS[$index]}"
    temporary_path="$path.ytme-install.$$"
    if [[ -e "$temporary_path" || -L "$temporary_path" ]]; then
      rm -f "$temporary_path"
    fi
    if [[ "${MANIFEST_WRITTEN[$index]:-0}" == "1" ]]; then
      if [[ "${MANIFEST_EXISTED[$index]:-0}" == "1" ]]; then
        cp -p "$TRANSACTION_ROOT/manifest-$index" "$path"
      else
        rm -f "$path"
      fi
    fi
    index=$((index + 1))
  done

  rm -rf "$STAGE_ROOT" "$TRANSACTION_ROOT"
}

finish_or_rollback() {
  local status=$?
  trap - EXIT
  if [[ "${TRANSACTION_ACTIVE:-0}" == "1" ]]; then
    rollback_install
  fi
  exit "$status"
}
trap finish_or_rollback EXIT

mkdir -p "$STAGE_ROOT/bin"
install -m 0755 "$PACKAGE_DIR/ytme" "$STAGE_ROOT/bin/ytme"
install -m 0755 "$PACKAGE_DIR/ytme-native-host" \
  "$STAGE_ROOT/bin/ytme-native-host"
install -m 0755 "$PACKAGE_DIR/uninstall.sh" "$STAGE_ROOT/uninstall.sh"
install -m 0644 "$PACKAGE_DIR/VERSION" "$STAGE_ROOT/VERSION"
install -m 0644 "$PACKAGE_DIR/RUNTIME" "$STAGE_ROOT/RUNTIME"
install -m 0644 "$PACKAGE_DIR/LICENSE" "$STAGE_ROOT/LICENSE"
printf '%s\n' "$MARKER_CONTENT" >"$STAGE_ROOT/$MARKER_NAME"
chmod 0644 "$STAGE_ROOT/$MARKER_NAME"
write_state "$STAGE_ROOT/$STATE_NAME"

if [[ -L "$CLI_PATH" ]]; then
  HAD_CLI_LINK=1
  OLD_CLI_TARGET="$(readlink "$CLI_PATH")"
fi

index=0
while [[ "$index" -lt "${#MANIFEST_PATHS[@]}" ]]; do
  path="${MANIFEST_PATHS[$index]}"
  MANIFEST_WRITTEN[index]=0
  if [[ -e "$path" ]]; then
    MANIFEST_EXISTED[index]=1
    cp -p "$path" "$TRANSACTION_ROOT/manifest-$index"
  else
    MANIFEST_EXISTED[index]=0
  fi
  index=$((index + 1))
done

if [[ -d "$INSTALL_ROOT" ]]; then
  mv "$INSTALL_ROOT" "$BACKUP_ROOT"
  HAD_OLD_ROOT=1
fi
mv "$STAGE_ROOT" "$INSTALL_ROOT"
ROOT_SWITCHED=1

mkdir -p "$CLI_BIN_DIR"
CLI_LINK_TEMP="$CLI_BIN_DIR/.ytme-install.$$"
rm -f "$CLI_LINK_TEMP"
ln -s "$INSTALL_BIN_DIR/ytme" "$CLI_LINK_TEMP"
mv -f "$CLI_LINK_TEMP" "$CLI_PATH"

index=0
while [[ "$index" -lt "${#MANIFEST_PATHS[@]}" ]]; do
  path="${MANIFEST_PATHS[$index]}"
  case "${MANIFEST_KINDS[$index]}" in
    chromium)
      write_chromium_manifest "$path"
      ;;
    firefox)
      write_firefox_manifest "$path"
      ;;
    *)
      fail "Unknown native messaging manifest kind."
      ;;
  esac
  MANIFEST_WRITTEN[index]=1
  echo "Installed $path"
  index=$((index + 1))
done

TRANSACTION_ACTIVE=0
trap - EXIT
rm -rf "$BACKUP_ROOT" "$TRANSACTION_ROOT"

echo "Installed YTM Enhancer CLI $PACKAGE_VERSION ($PACKAGE_RUNTIME)."
echo "Enable Connected Apps and YTM Enhancer CLI in the browser extension."
if path_contains_dir "$CLI_BIN_DIR"; then
  echo "Then run: ytme doctor"
else
  echo "Then run: $CLI_PATH doctor"
  echo "Add $CLI_BIN_DIR to PATH to run ytme directly."
fi
