#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project="${REMOTE_QA_MENU_BAR_E2E_PROJECT:-chromium}"
require_buttons="${REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS:-0}"

case "$project" in
  chromium | edge) ;;
  *)
    echo "Unsupported REMOTE_QA_MENU_BAR_E2E_PROJECT: $project" >&2
    echo "Supported projects: chromium, edge" >&2
    exit 2
    ;;
esac

case "$require_buttons" in
  0 | 1) ;;
  *)
    echo "Unsupported REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS: $require_buttons" >&2
    echo "Supported values: 0, 1" >&2
    exit 2
    ;;
esac

"$script_dir/crabbox-run.sh" --shell "
  env CI=true YTME_MENU_BAR_E2E_PROJECT=$project YTME_MENU_BAR_REQUIRE_BUTTONS=$require_buttons scripts/macos-qa/menu-bar-button-smoke.sh
"
