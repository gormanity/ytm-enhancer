#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
installer_path="${1:-}"
ui_ready_timeout="${YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS:-60}"
operation_timeout="${YTM_WINDOWS_TRAY_SAC_OPERATION_TIMEOUT_SECONDS:-60}"

usage() {
  echo "Usage: $0 <windows-installer-path>" >&2
  echo "The installer must already exist outside REMOTE_QA_WINDOWS_WORK_ROOT on the Windows target." >&2
}

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

validate_timeout() {
  label="$1"
  value="$2"

  case "$value" in
    "" | *[!0123456789]*)
      echo "Invalid $label: $value" >&2
      exit 2
      ;;
  esac

  if [ "$value" -eq 0 ]; then
    echo "$label must be greater than zero." >&2
    exit 2
  fi
}

if [ "$#" -ne 1 ] || [ -z "$installer_path" ]; then
  usage
  exit 2
fi

validate_timeout \
  "YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS" \
  "$ui_ready_timeout"
validate_timeout \
  "YTM_WINDOWS_TRAY_SAC_OPERATION_TIMEOUT_SECONDS" \
  "$operation_timeout"

windows_script="& .\scripts\windows-qa\tray-sac-smoke.ps1"
windows_script="$windows_script -InstallerPath $(ps_quote "$installer_path")"
windows_script="$windows_script -UiReadyTimeoutSeconds $ui_ready_timeout"
windows_script="$windows_script -OperationTimeoutSeconds $operation_timeout"

"$script_dir/run.sh" --shell "$windows_script"
