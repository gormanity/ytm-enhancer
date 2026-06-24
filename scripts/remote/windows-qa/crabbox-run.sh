#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
config_file="${REMOTE_QA_CONFIG:-$repo_root/.remote-qa.env}"
macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"

if [ -f "$config_file" ]; then
  # shellcheck disable=SC1090
  . "$config_file"
fi

windows_host="${REMOTE_QA_WINDOWS_HOST:-}"
windows_user="${REMOTE_QA_WINDOWS_USER:-}"
windows_port="${REMOTE_QA_WINDOWS_PORT:-22}"
windows_work_root="${REMOTE_QA_WINDOWS_WORK_ROOT:-}"
windows_ssh_key="${REMOTE_QA_WINDOWS_SSH_KEY:-}"

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

if [ ! -x "$macos_runner" ]; then
  echo "macOS QA runner is missing or not executable: $macos_runner" >&2
  exit 1
fi

if [ -z "$windows_host" ] || [ -z "$windows_user" ] || [ -z "$windows_work_root" ]; then
  echo "Windows QA target is not configured." >&2
  echo "Set REMOTE_QA_WINDOWS_HOST, REMOTE_QA_WINDOWS_USER, and REMOTE_QA_WINDOWS_WORK_ROOT." >&2
  echo "You can place them in ignored .remote-qa.env." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 [--shell <powershell-script> | -- <command...>]" >&2
  exit 2
fi

if [ "${1:-}" = "--shell" ]; then
  if [ "$#" -ne 2 ]; then
    echo "Usage: $0 --shell <powershell-script>" >&2
    exit 2
  fi
  windows_script="$2"
else
  if [ "${1:-}" = "--" ]; then
    shift
  fi
  if [ "$#" -eq 0 ]; then
    echo "Usage: $0 -- <command...>" >&2
    exit 2
  fi

  command_line=""
  for arg in "$@"; do
    if [ -z "$command_line" ]; then
      command_line="$(ps_quote "$arg")"
    else
      command_line="$command_line $(ps_quote "$arg")"
    fi
  done

  windows_script="& $command_line
if (\$LASTEXITCODE -is [int] -and \$LASTEXITCODE -ne 0) {
  exit \$LASTEXITCODE
}"
fi

remote_command='
set -eu

windows_host='"$(quote "$windows_host")"'
windows_user='"$(quote "$windows_user")"'
windows_port='"$(quote "$windows_port")"'
windows_work_root='"$(quote "$windows_work_root")"'
windows_ssh_key='"$(quote "$windows_ssh_key")"'
windows_script='"$(quote "$windows_script")"'

ps_quote() {
  printf "'\''%s'\''" "$(printf "%s" "$1" | sed "s/'\''/'\'''\''/g")"
}

ps_encoded() {
  printf "%s" "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d "\n"
}

ssh_windows() {
  if [ -n "$windows_ssh_key" ]; then
    ssh -o BatchMode=yes -p "$windows_port" -i "$windows_ssh_key" \
      "$windows_user@$windows_host" "$@"
    return
  fi

  ssh -o BatchMode=yes -p "$windows_port" "$windows_user@$windows_host" "$@"
}

if ! command -v ssh >/dev/null 2>&1; then
  echo "Windows QA requires ssh on the remote Mac." >&2
  exit 127
fi

if ! command -v iconv >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
  echo "Windows QA requires iconv and base64 on the remote Mac." >&2
  exit 127
fi

target_literal="$(ps_quote "$windows_work_root")"
sync_script="
\$ErrorActionPreference = '"'"'Stop'"'"'
\$target = $target_literal
if (Test-Path -LiteralPath \$target) {
  Remove-Item -LiteralPath \$target -Recurse -Force
}
New-Item -ItemType Directory -Force -Path \$target | Out-Null
tar -xzf - -C \$target
"

sync_command="$(ps_encoded "$sync_script")"

COPYFILE_DISABLE=1 tar -czf - \
  --exclude .crabbox \
  --exclude .git \
  --exclude .jj \
  --exclude .pnpm-store \
  --exclude node_modules \
  --exclude dist \
  --exclude dist-dev \
  --exclude releases \
  --exclude test-results \
  --exclude apps/cli/.build \
  . | ssh_windows powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand "$sync_command"

run_script="
\$ErrorActionPreference = '"'"'Stop'"'"'
Set-Location -LiteralPath $target_literal
$windows_script
if (\$LASTEXITCODE -is [int] -and \$LASTEXITCODE -ne 0) {
  exit \$LASTEXITCODE
}
"

run_command="$(ps_encoded "$run_script")"
ssh_windows powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand "$run_command"
'

"$macos_runner" --shell "$remote_command"
