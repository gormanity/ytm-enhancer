#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

windows_script='& .\scripts\windows-qa\tray-contention-smoke.ps1'
if [ -n "${YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL:-}" ]; then
  windows_script="$windows_script -ExpectedOwner $(ps_quote "$YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL")"
fi

if [ "${YTME_WINDOWS_TRAY_CONTENTION_PREFLIGHT_ONLY:-}" = "1" ]; then
  windows_script="$windows_script -PreflightOnly"
fi

"$script_dir/run.sh" --preserve-apps --shell "$windows_script"
