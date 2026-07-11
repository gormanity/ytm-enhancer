#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH='' cd -- "$script_dir/../.." && pwd)"
project="${YTME_MENU_BAR_E2E_PROJECT:-${REMOTE_QA_MENU_BAR_E2E_PROJECT:-chromium}}"
require_buttons="${YTME_MENU_BAR_REQUIRE_BUTTONS:-${REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS:-0}}"
state_root=""

manifest_paths() {
  printf '%s\n' \
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json" \
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json" \
    "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json" \
    "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json"
}

snapshot_existing_state() {
  state_root="$(mktemp -d "${TMPDIR:-/tmp}/ytme-menu-bar-smoke-state.XXXXXX")"
  mkdir -p "$state_root/manifests"
  : >"$state_root/preexisting-apps"
  : >"$state_root/preexisting-pids"

  index=0
  manifest_paths | while IFS= read -r manifest_path; do
    index=$((index + 1))
    if [ -f "$manifest_path" ]; then
      cp -p "$manifest_path" "$state_root/manifests/$index.json"
      printf '%s\n' "$manifest_path" >"$state_root/manifests/$index.path"
    fi
  done

  pgrep -f YTMMenuBarConnector 2>/dev/null | while IFS= read -r pid; do
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$command_line" in
      *"/Contents/MacOS/YTMMenuBarConnector"*)
        app_path=${command_line%%/Contents/MacOS/YTMMenuBarConnector*}
        if [ -d "$app_path" ]; then
          if ! grep -Fqx -- "$app_path" "$state_root/preexisting-apps"; then
            printf '%s\n' "$app_path" >>"$state_root/preexisting-apps"
          fi
          printf '%s\n' "$pid" >>"$state_root/preexisting-pids"
          kill "$pid" 2>/dev/null || true
        fi
        ;;
    esac
  done

  sleep 1
  while IFS= read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done <"$state_root/preexisting-pids"
}

restore_existing_state() {
  if [ -z "$state_root" ] || [ ! -d "$state_root" ]; then
    return
  fi

  : >"$state_root/qa-pids"
  pgrep -f YTMMenuBarConnector 2>/dev/null | while IFS= read -r pid; do
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$command_line" in
      *"/Contents/MacOS/YTMMenuBarConnector"*)
        printf '%s\n' "$pid" >>"$state_root/qa-pids"
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done

  sleep 1
  while IFS= read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done <"$state_root/qa-pids"

  manifest_paths | while IFS= read -r manifest_path; do
    rm -f "$manifest_path"
  done

  for path_file in "$state_root"/manifests/*.path; do
    if [ ! -f "$path_file" ]; then
      continue
    fi
    manifest_path="$(sed -n '1p' "$path_file")"
    backup_path="${path_file%.path}.json"
    mkdir -p "$(dirname "$manifest_path")"
    cp -p "$backup_path" "$manifest_path"
  done

  while IFS= read -r app_path; do
    if [ -n "$app_path" ] && [ -d "$app_path" ]; then
      open -n "$app_path" >/dev/null 2>&1 || true
    fi
  done <"$state_root/preexisting-apps"

  rm -rf "$state_root"
  state_root=""
}

case "$project" in
  chromium)
    build_command="dev:build:chrome"
    install_browser="chromium"
    ;;
  edge)
    build_command="dev:build:edge"
    install_browser=""
    ;;
  firefox)
    build_command="dev:build:firefox"
    install_browser="firefox"
    ;;
  *)
    echo "Unsupported YTME_MENU_BAR_E2E_PROJECT: $project" >&2
    echo "Supported projects: chromium, edge, firefox" >&2
    exit 2
    ;;
esac

case "$require_buttons" in
  0 | 1) ;;
  *)
    echo "Unsupported YTME_MENU_BAR_REQUIRE_BUTTONS: $require_buttons" >&2
    echo "Supported values: 0, 1" >&2
    exit 2
    ;;
esac

cd "$repo_root"

snapshot_existing_state
trap restore_existing_state EXIT

env CI=true pnpm install --frozen-lockfile

if [ -n "$install_browser" ]; then
  env CI=true pnpm exec playwright install "$install_browser"
fi

env CI=true pnpm run "$build_command"
env CI=true \
  YTME_E2E_MENU_BAR=1 \
  YTME_E2E_REQUIRE_MENU_BAR_AUTOMATION="$require_buttons" \
  pnpm exec playwright test tests/e2e/menu-bar-connector.spec.ts \
    --project="$project" \
    --workers=1
