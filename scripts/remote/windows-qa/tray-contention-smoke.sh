#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$script_dir/run.sh" --preserve-apps --shell '& .\scripts\windows-qa\tray-contention-smoke.ps1'
