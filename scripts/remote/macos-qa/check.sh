#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$script_dir/crabbox-run.sh" --shell '
  env CI=true pnpm install --frozen-lockfile &&
  env CI=true pnpm run format:check &&
  env CI=true pnpm run lint &&
  env CI=true pnpm run css:dead &&
  env CI=true pnpm run data-role:check &&
  env CI=true pnpm run typecheck &&
  env CI=true pnpm run test &&
  env CI=true pnpm run build:chrome &&
  env CI=true pnpm run build:firefox &&
  env CI=true pnpm run lint:addons:firefox:dist &&
  env CI=true pnpm run build:edge &&
  env CI=true pnpm run dev:build:wc
'
