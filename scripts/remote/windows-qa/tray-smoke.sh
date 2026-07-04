#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

"$script_dir/run.sh" --shell '& .\scripts\windows-qa\tray-smoke.ps1'
