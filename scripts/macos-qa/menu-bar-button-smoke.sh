#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
project="${YTME_MENU_BAR_E2E_PROJECT:-${REMOTE_QA_MENU_BAR_E2E_PROJECT:-chromium}}"
require_buttons="${YTME_MENU_BAR_REQUIRE_BUTTONS:-${REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS:-0}}"

case "$project" in
  chromium)
    build_command="dev:build:chrome"
    install_browser="1"
    ;;
  edge)
    build_command="dev:build:edge"
    install_browser="0"
    ;;
  *)
    echo "Unsupported YTME_MENU_BAR_E2E_PROJECT: $project" >&2
    echo "Supported projects: chromium, edge" >&2
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

env CI=true pnpm install --frozen-lockfile

if [ "$install_browser" = "1" ]; then
  env CI=true pnpm exec playwright install chromium
fi

env CI=true pnpm run "$build_command"
env CI=true \
  YTME_E2E_MENU_BAR=1 \
  YTME_E2E_REQUIRE_MENU_BAR_AUTOMATION="$require_buttons" \
  pnpm exec playwright test tests/e2e/menu-bar-connector.spec.ts --project="$project"
