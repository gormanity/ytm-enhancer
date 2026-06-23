#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$script_dir/crabbox-run.sh" --shell '
  . scripts/remote/linux-qa/bootstrap-toolchain.sh node go &&
  env CI=true pnpm install --frozen-lockfile &&
  node -e "const scripts = require(\"./package.json\").scripts || {};
if (!scripts[\"cli:test\"]) {
  console.error(\"cli:test is not available in this checkout.\");
  console.error(\"Switch to the CLI connector stack first.\");
  process.exit(2);
}" &&
  env CI=true pnpm run cli:test &&
  go -C apps/cli build -o /tmp/ytme ./cmd/ytme &&
  /tmp/ytme --version
'
