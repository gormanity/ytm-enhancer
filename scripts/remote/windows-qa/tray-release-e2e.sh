#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
baseline_version="${1:-${YTM_WINDOWS_TRAY_BASELINE_VERSION:-}}"
target_version="${2:-${YTM_WINDOWS_TRAY_TARGET_VERSION:-}}"

usage() {
  echo "Usage: $0 <baseline-version> <target-version>" >&2
}

validate_version() {
  label="$1"
  version="$2"

  case "$version" in
    "" | *[!0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.+-]*)
      echo "Invalid $label version: $version" >&2
      echo "Use a tag version such as 0.1.1 or 0.1.2-beta.1." >&2
      exit 2
      ;;
  esac
}

if [ "$#" -gt 2 ] || [ -z "$baseline_version" ] || [ -z "$target_version" ]; then
  usage
  exit 2
fi

validate_version "baseline" "$baseline_version"
validate_version "target" "$target_version"

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

windows_script="& .\scripts\windows-qa\tray-release-e2e.ps1"
windows_script="$windows_script -BaselineVersion $(ps_quote "$baseline_version")"
windows_script="$windows_script -TargetVersion $(ps_quote "$target_version")"

"$script_dir/run.sh" --shell "$windows_script"
