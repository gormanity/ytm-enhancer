#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
baseline_version="${1:-${YTM_WINDOWS_TRAY_BASELINE_VERSION:-}}"
target_version="${2:-${YTM_WINDOWS_TRAY_TARGET_VERSION:-}}"

usage() {
  echo "Usage: $0 <baseline-version> <target-version>" >&2
}

if [ "$#" -gt 2 ] || [ -z "$baseline_version" ] || [ -z "$target_version" ]; then
  usage
  exit 2
fi

case "$baseline_version:$target_version" in
  *[!0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.+:-]*)
    usage
    exit 2
    ;;
esac

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

windows_script="& .\scripts\windows-qa\tray-release-e2e.ps1"
windows_script="$windows_script -BaselineVersion $(ps_quote "$baseline_version")"
windows_script="$windows_script -TargetVersion $(ps_quote "$target_version")"

"$script_dir/run.sh" --shell "$windows_script"
