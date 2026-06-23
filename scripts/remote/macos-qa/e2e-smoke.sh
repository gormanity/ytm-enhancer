#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
projects="${REMOTE_QA_E2E_PROJECTS:-chromium firefox}"

project_args=""
for project in $projects; do
  project_args="$project_args --project=$project"
done

"$script_dir/crabbox-run.sh" --shell "
  env CI=true pnpm install --frozen-lockfile &&
  env CI=true pnpm exec playwright install chromium firefox &&
  env CI=true pnpm run build:chrome &&
  env CI=true pnpm run dev:build:wc &&
  env CI=true pnpm exec playwright test tests/e2e $project_args
"
