#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
target_version="${1:-${YTM_WINDOWS_TRAY_OPERATIONAL_VERSION:-}}"
ui_ready_timeout="${YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS:-60}"
playback_url="${YTM_WINDOWS_TRAY_OPERATIONAL_PLAYBACK_URL:-https://music.youtube.com/}"
skip_chrome="${YTM_WINDOWS_TRAY_OPERATIONAL_SKIP_CHROME:-}"

usage() {
  echo "Usage: $0 [target-version]" >&2
}

validate_version() {
  version="$1"

  case "$version" in
    "" | *[!0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.+-]*)
      echo "Invalid target version: $version" >&2
      echo "Use a tag version such as 0.1.4 or 0.1.5-beta.1." >&2
      exit 2
      ;;
  esac
}

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

if [ "$#" -gt 1 ]; then
  usage
  exit 2
fi

if [ -n "$target_version" ]; then
  validate_version "$target_version"
fi

case "$ui_ready_timeout" in
  "" | *[!0123456789]*)
    echo "Invalid YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS: $ui_ready_timeout" >&2
    exit 2
    ;;
esac

windows_script="& .\scripts\windows-qa\tray-operational-smoke.ps1"
if [ -n "$target_version" ]; then
  windows_script="$windows_script -Version $(ps_quote "$target_version")"
fi
windows_script="$windows_script -UiReadyTimeoutSeconds $ui_ready_timeout"
windows_script="$windows_script -PlaybackUrl $(ps_quote "$playback_url")"

if [ "$skip_chrome" = "1" ]; then
  windows_script="$windows_script -SkipChromeLaunch"
fi

"$script_dir/run.sh" --shell "$windows_script"
