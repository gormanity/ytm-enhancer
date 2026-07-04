#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ui_ready_timeout="${YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS:-60}"

case "$ui_ready_timeout" in
  "" | *[!0123456789]*)
    echo "Invalid YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS: $ui_ready_timeout" >&2
    exit 2
    ;;
esac

"$script_dir/run.sh" --shell \
  "& .\scripts\windows-qa\tray-visual-smoke.ps1 -UiReadyTimeoutSeconds $ui_ready_timeout"
