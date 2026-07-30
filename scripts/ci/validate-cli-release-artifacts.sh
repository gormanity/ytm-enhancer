#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 || ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 <version>" >&2
  exit 2
fi

version="$1"
script_dir="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
package_root="${YTM_CLI_PACKAGE_ROOT:-$repo_root/apps/cli/.build/packages}"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/ytme-cli-release-validate.XXXXXX")"
extract_root="$temporary_root/extracted"

cleanup() {
  rm -rf "$temporary_root"
}
trap cleanup EXIT

fail() {
  echo "CLI release artifact validation failed: $*" >&2
  exit 1
}

archive_name() {
  local runtime="$1"
  case "$runtime" in
    macos-x64 | macos-arm64)
      printf "YTM-Enhancer-CLI-%s-%s.zip" "$version" "$runtime"
      ;;
    linux-x64 | linux-arm64)
      printf "YTM-Enhancer-CLI-%s-%s.tar.gz" "$version" "$runtime"
      ;;
    *)
      fail "unknown runtime $runtime"
      ;;
  esac
}

validate_archive_listing() {
  local runtime="$1"
  local archive="$2"
  local payload_name="YTM-Enhancer-CLI-$version-$runtime"
  local listing="$temporary_root/$runtime.list"
  local entry

  case "$archive" in
    *.zip)
      unzip -Z1 "$archive" >"$listing"
      ;;
    *.tar.gz)
      tar -tzf "$archive" >"$listing"
      ;;
    *)
      fail "unsupported archive type: $archive"
      ;;
  esac

  [[ -s "$listing" ]] || fail "$archive has no entries"
  while IFS= read -r entry || [[ -n "$entry" ]]; do
    [[ -n "$entry" ]] || continue
    case "$entry" in
      /* | *\\* | ../* | */../* | */..)
        fail "$archive contains an unsafe path: $entry"
        ;;
    esac
    case "$entry" in
      "$payload_name" | "$payload_name/" | "$payload_name"/*) ;;
      *) fail "$archive contains an entry outside $payload_name: $entry" ;;
    esac
  done <"$listing"
}

extract_archive() {
  local runtime="$1"
  local archive="$2"
  local destination="$extract_root/$runtime"
  mkdir -p "$destination"
  case "$archive" in
    *.zip)
      unzip -q "$archive" -d "$destination"
      ;;
    *.tar.gz)
      tar -xzf "$archive" -C "$destination"
      ;;
  esac
}

validate_binary_architecture() {
  local runtime="$1"
  local executable="$2"
  local description
  description="$(file "$executable")"
  case "$runtime" in
    macos-x64)
      [[ "$description" == *"Mach-O 64-bit executable x86_64"* ]] ||
        fail "$executable is not a macOS x64 executable: $description"
      ;;
    macos-arm64)
      [[ "$description" == *"Mach-O 64-bit executable arm64"* ]] ||
        fail "$executable is not a macOS arm64 executable: $description"
      ;;
    linux-x64)
      [[ "$description" == *"ELF 64-bit LSB executable, x86-64"* ]] ||
        fail "$executable is not a Linux x64 executable: $description"
      ;;
    linux-arm64)
      [[
        "$description" == *"ELF 64-bit LSB executable, ARM aarch64"* ||
          "$description" == *"ELF 64-bit LSB executable, ARM64"*
      ]] || fail "$executable is not a Linux arm64 executable: $description"
      ;;
  esac
}

validate_macos_security() {
  local executable="$1"
  local signature

  codesign --verify --strict --verbose=2 "$executable"
  signature="$(codesign -d --verbose=4 "$executable" 2>&1)"
  printf "%s\n" "$signature"
  printf "%s\n" "$signature" |
    grep -F "Authority=Developer ID Application:" >/dev/null ||
    fail "$executable does not have a Developer ID Application signature"
  printf "%s\n" "$signature" |
    grep -F "Timestamp=" >/dev/null ||
    fail "$executable does not have a secure signing timestamp"
  printf "%s\n" "$signature" |
    grep -F "Runtime Version=" >/dev/null ||
    fail "$executable does not have the hardened runtime enabled"
}

validate_payload() {
  local runtime="$1"
  local payload="$extract_root/$runtime/YTM-Enhancer-CLI-$version-$runtime"
  local name

  [[ -d "$payload" && ! -L "$payload" ]] ||
    fail "payload directory is missing for $runtime"
  for name in \
    ytme \
    ytme-native-host \
    install.sh \
    uninstall.sh \
    README.md \
    LICENSE \
    VERSION \
    RUNTIME; do
    [[ -f "$payload/$name" && ! -L "$payload/$name" ]] ||
      fail "$runtime payload is missing regular file $name"
  done
  for name in ytme ytme-native-host install.sh uninstall.sh; do
    [[ -x "$payload/$name" ]] ||
      fail "$runtime payload file is not executable: $name"
  done
  [[ "$(cat "$payload/VERSION")" == "$version" ]] ||
    fail "$runtime VERSION does not match $version"
  [[ "$(cat "$payload/RUNTIME")" == "$runtime" ]] ||
    fail "$runtime RUNTIME marker does not match"

  for name in ytme ytme-native-host; do
    validate_binary_architecture "$runtime" "$payload/$name"
    case "$runtime" in
      macos-*) validate_macos_security "$payload/$name" ;;
    esac
  done
}

validate_install_rollback() {
  local payload="$1"
  local home="$temporary_root/rollback-home"
  local data_home="$home/.local/share"
  local bin_dir="$home/.local/bin"
  mkdir -p "$home"
  printf "blocks manifest directory creation\n" >"$home/Library"

  if env \
    HOME="$home" \
    PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
    XDG_CONFIG_HOME="$home/.config" \
    XDG_DATA_HOME="$data_home" \
    YTME_BIN_DIR="$bin_dir" \
    "$payload/install.sh"; then
    fail "packaged installer unexpectedly succeeded during rollback smoke"
  fi
  [[ ! -e "$data_home/ytm-enhancer-cli" ]] ||
    fail "failed install left a partial install root"
  [[ ! -e "$bin_dir/ytme" && ! -L "$bin_dir/ytme" ]] ||
    fail "failed install left a CLI link"
}

validate_host_install() {
  local runtime payload home data_home config_home bin_dir install_root
  local manifest_path
  case "$(uname -m)" in
    x86_64 | amd64) runtime="macos-x64" ;;
    arm64 | aarch64) runtime="macos-arm64" ;;
    *) fail "unsupported validation runner architecture: $(uname -m)" ;;
  esac
  payload="$extract_root/$runtime/YTM-Enhancer-CLI-$version-$runtime"
  home="$temporary_root/install-home"
  data_home="$home/.local/share"
  config_home="$home/.config"
  bin_dir="$home/.local/bin"
  install_root="$data_home/ytm-enhancer-cli"
  mkdir -p "$home"

  env \
    HOME="$home" \
    PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
    XDG_CONFIG_HOME="$config_home" \
    XDG_DATA_HOME="$data_home" \
    YTME_BIN_DIR="$bin_dir" \
    "$payload/install.sh"

  [[ "$("$bin_dir/ytme" --version)" == "ytme $version" ]] ||
    fail "installed CLI did not report version $version"
  [[ -f "$install_root/.ytm-enhancer-cli-managed" ]] ||
    fail "installed CLI ownership marker is missing"
  [[ -f "$install_root/.install-state" ]] ||
    fail "installed CLI state is missing"

  for manifest_path in \
    "$home/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json" \
    "$home/Library/Application Support/Chromium/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json" \
    "$home/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json" \
    "$home/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json" \
    "$home/Library/Application Support/Mozilla/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json"; do
    [[ -f "$manifest_path" && ! -L "$manifest_path" ]] ||
      fail "packaged install did not write $manifest_path"
    grep -F "\"path\": \"$install_root/bin/ytme-native-host\"" \
      "$manifest_path" >/dev/null ||
      fail "native messaging manifest has the wrong host path: $manifest_path"
  done

  env PATH="/usr/bin:/bin:/usr/sbin:/sbin" "$install_root/uninstall.sh"
  [[ ! -e "$install_root" ]] ||
    fail "packaged uninstaller left the install root"
  [[ ! -e "$bin_dir/ytme" && ! -L "$bin_dir/ytme" ]] ||
    fail "packaged uninstaller left the CLI link"
  while IFS= read -r manifest_path; do
    [[ ! -e "$manifest_path" && ! -L "$manifest_path" ]] ||
      fail "packaged uninstaller left $manifest_path"
  done <<EOF
$home/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json
$home/Library/Application Support/Chromium/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json
$home/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json
$home/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json
$home/Library/Application Support/Mozilla/NativeMessagingHosts/com.gormanity.ytm_enhancer.cli.json
EOF

  validate_install_rollback "$payload"
}

mkdir -p "$extract_root"
expected_assets=(
  "$(archive_name macos-x64)"
  "$(archive_name macos-arm64)"
  "$(archive_name linux-x64)"
  "$(archive_name linux-arm64)"
)

[[ -f "$package_root/SHA256SUMS" && -s "$package_root/SHA256SUMS" ]] ||
  fail "SHA256SUMS is missing or empty"

for asset in "${expected_assets[@]}"; do
  [[ -f "$package_root/$asset" && -s "$package_root/$asset" ]] ||
    fail "release asset is missing or empty: $asset"
  grep -E "^[0-9a-f]{64}  $asset$" "$package_root/SHA256SUMS" >/dev/null ||
    fail "SHA256SUMS does not contain exactly formatted checksum for $asset"
done
[[ "$(wc -l <"$package_root/SHA256SUMS" | tr -d ' ')" == "4" ]] ||
  fail "SHA256SUMS must contain exactly four entries"

while IFS= read -r candidate; do
  candidate_name="$(basename "$candidate")"
  allowed=false
  for asset in "${expected_assets[@]}"; do
    if [[ "$candidate_name" == "$asset" ]]; then
      allowed=true
      break
    fi
  done
  [[ "$allowed" == "true" ]] ||
    fail "unexpected CLI archive would be published: $candidate_name"
done < <(
  find "$package_root" -maxdepth 1 -type f \
    \( -name "*.zip" -o -name "*.tar.gz" \) -print
)

(
  cd "$package_root"
  shasum -a 256 -c SHA256SUMS
)

for runtime in macos-x64 macos-arm64 linux-x64 linux-arm64; do
  archive="$package_root/$(archive_name "$runtime")"
  validate_archive_listing "$runtime" "$archive"
  extract_archive "$runtime" "$archive"
  validate_payload "$runtime"
done

validate_host_install
echo "Validated CLI release artifacts for $version."
