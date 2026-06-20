#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gormanity.ytm_enhancer.menu_bar"
APP_NAME="YTM Menu Bar"
LOCAL_APP_PATH="${YTM_ENHANCER_LOCAL_APP_PATH:-$HOME/Applications/$APP_NAME.app}"

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
  fi
done

if [[ "${YTM_ENHANCER_KEEP_LOCAL_APP:-0}" != "1" && -e "$LOCAL_APP_PATH" ]]; then
  rm -rf "$LOCAL_APP_PATH"
  echo "Removed $LOCAL_APP_PATH"
fi
