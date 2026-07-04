#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

REMOTE_QA_WINDOWS_TRANSPORT="${REMOTE_QA_WINDOWS_TRANSPORT:-macos}" \
  exec "$script_dir/run.sh" "$@"
