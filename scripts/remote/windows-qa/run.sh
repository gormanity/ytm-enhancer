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

transport="${REMOTE_QA_WINDOWS_TRANSPORT:-direct}"
windows_host="${REMOTE_QA_WINDOWS_HOST:-}"
windows_user="${REMOTE_QA_WINDOWS_USER:-}"
windows_port="${REMOTE_QA_WINDOWS_PORT:-22}"
windows_work_root="${REMOTE_QA_WINDOWS_WORK_ROOT:-}"
windows_ssh_key="${REMOTE_QA_WINDOWS_SSH_KEY:-}"
windows_pnpm_node_linker="${REMOTE_QA_WINDOWS_PNPM_NODE_LINKER:-}"
windows_pnpm_package_import_method="${REMOTE_QA_WINDOWS_PNPM_PACKAGE_IMPORT_METHOD:-}"

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
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

usage() {
  echo "Usage: $0 [--shell <powershell-script> | -- <command...>]" >&2
}

if [ -z "$windows_host" ] || [ -z "$windows_user" ] || [ -z "$windows_work_root" ]; then
  echo "Windows QA target is not configured." >&2
  echo "Set REMOTE_QA_WINDOWS_HOST, REMOTE_QA_WINDOWS_USER, and REMOTE_QA_WINDOWS_WORK_ROOT." >&2
  echo "You can place them in ignored .remote-qa.env." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

if [ "${1:-}" = "--shell" ]; then
  if [ "$#" -ne 2 ]; then
    usage
    exit 2
  fi
  windows_script="$2"
else
  if [ "${1:-}" = "--" ]; then
    shift
  fi
  if [ "$#" -eq 0 ]; then
    usage
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

run_direct() {
  if ! command -v ssh >/dev/null 2>&1; then
    echo "Windows QA requires ssh on this host." >&2
    exit 127
  fi

  if ! command -v iconv >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
    echo "Windows QA requires iconv and base64 on this host." >&2
    exit 127
  fi

  target_literal="$(ps_quote "$windows_work_root")"
  sync_script="
\$ErrorActionPreference = 'Stop'
\$ProgressPreference = 'SilentlyContinue'
\$target = $target_literal

function Remove-QaTree {
  param([Parameter(Mandatory = \$true)][string] \$Path)

  if (-not (Test-Path -LiteralPath \$Path)) {
    return
  }

  Get-Process msedge, firefox, YTMTray, YTMTray.NativeHost -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500

  try {
    Remove-Item -LiteralPath \$Path -Recurse -Force -ErrorAction Stop
    return
  } catch {
    Write-Warning \"PowerShell cleanup failed for Windows QA work root; retrying with .NET delete.\"
  }

  try {
    [System.IO.Directory]::Delete(\$Path, \$true)
    return
  } catch {
    Write-Warning \".NET cleanup failed for Windows QA work root; retrying with cmd rmdir.\"
  }

  \$Quote = [char]34
  \$RmdirCommand = 'rmdir /s /q ' + \$Quote + \$Path + \$Quote
  \$Process = Start-Process -FilePath cmd.exe -ArgumentList @('/d', '/c', \$RmdirCommand) -Wait -PassThru -WindowStyle Hidden
  if ((Test-Path -LiteralPath \$Path) -or \$Process.ExitCode -ne 0) {
    \$RemainingItems = @()
    if (Test-Path -LiteralPath \$Path) {
      \$RemainingItems = @(Get-ChildItem -LiteralPath \$Path -Force -ErrorAction SilentlyContinue)
    }

    if (\$RemainingItems.Count -eq 0) {
      return
    }

    throw \"Unable to remove Windows QA work root: \$Path\"
  }
}
Remove-QaTree -Path \$target
New-Item -ItemType Directory -Force -Path \$target | Out-Null
tar -xzf - -C \$target
"

  sync_command="$(ps_encoded "$sync_script")"

  COPYFILE_DISABLE=1 tar -czf - \
    --exclude .crabbox \
    --exclude .git \
    --exclude .jj \
    --exclude .pnpm-store \
    --exclude CLAUDE.md \
    --exclude node_modules \
    --exclude dist \
    --exclude dist-dev \
    --exclude releases \
    --exclude test-results \
    --exclude apps/cli/.build \
    --exclude apps/menu-bar/.build \
    --exclude apps/windows-tray/.build \
    . | ssh_windows powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand "$sync_command"

  pnpm_env_script=""
  if [ -n "$windows_pnpm_node_linker" ]; then
    pnpm_env_script="$pnpm_env_script
\$env:PNPM_CONFIG_NODE_LINKER = $(ps_quote "$windows_pnpm_node_linker")"
  fi

  if [ -n "$windows_pnpm_package_import_method" ]; then
    pnpm_env_script="$pnpm_env_script
\$env:PNPM_CONFIG_PACKAGE_IMPORT_METHOD = $(ps_quote "$windows_pnpm_package_import_method")"
  fi

  run_script="
\$ErrorActionPreference = 'Stop'
\$ProgressPreference = 'SilentlyContinue'
$pnpm_env_script
Set-Location -LiteralPath $target_literal
$windows_script
if (\$LASTEXITCODE -is [int] -and \$LASTEXITCODE -ne 0) {
  exit \$LASTEXITCODE
}
"

  run_command="$(ps_encoded "$run_script")"
  ssh_windows powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand "$run_command"
}

run_macos_intermediary() {
  if [ ! -x "$macos_runner" ]; then
    echo "macOS QA runner is missing or not executable: $macos_runner" >&2
    exit 1
  fi

  remote_command='
set -eu

REMOTE_QA_CONFIG=/dev/null \
REMOTE_QA_WINDOWS_TRANSPORT=direct \
REMOTE_QA_WINDOWS_HOST='"$(quote "$windows_host")"' \
REMOTE_QA_WINDOWS_USER='"$(quote "$windows_user")"' \
REMOTE_QA_WINDOWS_PORT='"$(quote "$windows_port")"' \
REMOTE_QA_WINDOWS_WORK_ROOT='"$(quote "$windows_work_root")"' \
REMOTE_QA_WINDOWS_SSH_KEY='"$(quote "$windows_ssh_key")"' \
REMOTE_QA_WINDOWS_PNPM_NODE_LINKER='"$(quote "$windows_pnpm_node_linker")"' \
REMOTE_QA_WINDOWS_PNPM_PACKAGE_IMPORT_METHOD='"$(quote "$windows_pnpm_package_import_method")"' \
scripts/remote/windows-qa/run.sh --shell '"$(quote "$windows_script")"'
'

  "$macos_runner" --shell "$remote_command"
}

case "$transport" in
  direct)
    run_direct
    ;;
  macos | crabbox)
    run_macos_intermediary
    ;;
  *)
    echo "Unsupported REMOTE_QA_WINDOWS_TRANSPORT: $transport" >&2
    echo "Use direct or macos." >&2
    exit 2
    ;;
esac
