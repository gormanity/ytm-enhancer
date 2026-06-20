#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.menu_bar"
APP_NAME="YTM Menu Bar"
LOCAL_APP_PATH="${YTM_ENHANCER_LOCAL_APP_PATH:-$HOME/Applications/$APP_NAME.app}"
LOCAL_APP_EXECUTABLE="$LOCAL_APP_PATH/Contents/MacOS/YTMMenuBarConnector"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
PGREP="${PGREP:-/usr/bin/pgrep}"
PS="${PS:-/bin/ps}"

MANIFEST_PATHS=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$HOST_NAME.json"
  "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/$HOST_NAME.json"
)

for manifest_path in "${MANIFEST_PATHS[@]}"; do
  if [[ -e "$manifest_path" ]]; then
    rm -f "$manifest_path"
    echo "Removed $manifest_path"
  else
    echo "Manifest not found: $manifest_path"
  fi
done

is_local_app_process() {
  local pid="$1"
  local command
  command="$("$PS" -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command" == "$LOCAL_APP_EXECUTABLE"* ]]
}

stop_local_app() {
  if [[ ! -x "$PGREP" || ! -x "$PS" ]]; then
    return
  fi

  local pids=()
  local pid
  while IFS= read -r pid; do
    if [[ -n "$pid" ]] && is_local_app_process "$pid"; then
      pids+=("$pid")
    fi
  done < <("$PGREP" -f "YTMMenuBarConnector" 2>/dev/null || true)

  if [[ "${#pids[@]}" -eq 0 ]]; then
    return
  fi

  kill "${pids[@]}" 2>/dev/null || true
  sleep 1

  for pid in "${pids[@]}"; do
    if "$PS" -p "$pid" >/dev/null 2>&1; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done

  echo "Stopped local app process(es): ${pids[*]}"
}

unregister_local_app() {
  if [[ -x "$LSREGISTER" && -d "$LOCAL_APP_PATH" ]]; then
    "$LSREGISTER" -u "$LOCAL_APP_PATH" >/dev/null 2>&1 || true
    echo "Unregistered $LOCAL_APP_PATH"
  fi
}

if [[ "${YTM_ENHANCER_KEEP_LOCAL_APP:-0}" != "1" && -e "$LOCAL_APP_PATH" ]]; then
  stop_local_app
  unregister_local_app
  rm -rf "$LOCAL_APP_PATH"
  echo "Removed $LOCAL_APP_PATH"
  touch "$(dirname "$LOCAL_APP_PATH")"
elif [[ "${YTM_ENHANCER_KEEP_LOCAL_APP:-0}" == "1" ]]; then
  echo "Kept $LOCAL_APP_PATH"
else
  echo "Local app not found: $LOCAL_APP_PATH"
fi
