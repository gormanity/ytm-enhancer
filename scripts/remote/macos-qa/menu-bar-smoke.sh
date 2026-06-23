#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$script_dir/crabbox-run.sh" --shell '
  export SPARKLE_PUBLIC_ED_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= &&
  env CI=true pnpm install --frozen-lockfile &&
  env CI=true pnpm exec vitest run tests/apps/menu-bar-scaffold.test.ts &&
  env CI=true pnpm run menu-bar:package:direct
'
