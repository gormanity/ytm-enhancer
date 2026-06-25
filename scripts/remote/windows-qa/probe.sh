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
windows_ssh_key="${REMOTE_QA_WINDOWS_SSH_KEY:-}"

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

if [ ! -x "$macos_runner" ]; then
  echo "macOS QA runner is missing or not executable: $macos_runner" >&2
  exit 1
fi

if [ -z "$windows_host" ] || [ -z "$windows_user" ]; then
  echo "Windows QA target is not configured." >&2
  echo "Set REMOTE_QA_WINDOWS_HOST and REMOTE_QA_WINDOWS_USER." >&2
  echo "You can place them in ignored .remote-qa.env." >&2
  exit 1
fi

remote_command='
set -eu

windows_host='"$(quote "$windows_host")"'
windows_user='"$(quote "$windows_user")"'
windows_port='"$(quote "$windows_port")"'
windows_ssh_key='"$(quote "$windows_ssh_key")"'

if ! command -v nc >/dev/null 2>&1; then
  echo "Windows QA probe requires nc on the remote Mac." >&2
  exit 127
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "Windows QA probe requires ssh on the remote Mac." >&2
  exit 127
fi

echo "Checking Windows forwarded port..."
nc -vz "$windows_host" "$windows_port"

echo "Checking Windows OpenSSH banner and PowerShell..."
if [ -n "$windows_ssh_key" ]; then
  ssh -o BatchMode=yes -o ConnectTimeout=10 \
    -o ServerAliveInterval=2 -o ServerAliveCountMax=2 \
    -p "$windows_port" -i "$windows_ssh_key" \
    "$windows_user@$windows_host" \
    powershell.exe -NoProfile -Command '"'"'$PSVersionTable.PSVersion.ToString()'"'"'
else
  ssh -o BatchMode=yes -o ConnectTimeout=10 \
    -o ServerAliveInterval=2 -o ServerAliveCountMax=2 \
    -p "$windows_port" "$windows_user@$windows_host" \
    powershell.exe -NoProfile -Command '"'"'$PSVersionTable.PSVersion.ToString()'"'"'
fi
'

"$macos_runner" --shell "$remote_command"
