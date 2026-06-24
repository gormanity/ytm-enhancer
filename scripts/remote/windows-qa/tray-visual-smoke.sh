#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$script_dir/crabbox-run.sh" --shell '& .\scripts\remote\windows-qa\tray-visual-smoke.ps1'
