#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
baseline_version="${1:-${YTM_WINDOWS_TRAY_BASELINE_VERSION:-}}"
target_version="${2:-${YTM_WINDOWS_TRAY_TARGET_VERSION:-}}"
ui_ready_timeout="${YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS:-60}"

usage() {
  echo "Usage: $0 [baseline-version target-version]" >&2
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

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

if [ "$#" -gt 2 ] || [ -z "$baseline_version" ] || [ -z "$target_version" ]; then
  usage
  exit 2
fi

validate_version "baseline" "$baseline_version"
validate_version "target" "$target_version"

case "$ui_ready_timeout" in
  "" | *[!0123456789]*)
    echo "Invalid YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS: $ui_ready_timeout" >&2
    exit 2
    ;;
esac

windows_script="& .\scripts\windows-qa\tray-live-update-smoke.ps1"
windows_script="$windows_script -BaselineVersion $(ps_quote "$baseline_version")"
windows_script="$windows_script -TargetVersion $(ps_quote "$target_version")"
windows_script="$windows_script -UiReadyTimeoutSeconds $ui_ready_timeout"

"$script_dir/run.sh" --shell "$windows_script"
