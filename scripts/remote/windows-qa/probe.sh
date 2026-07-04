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
windows_ssh_key="${REMOTE_QA_WINDOWS_SSH_KEY:-}"

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

ps_encoded() {
  printf "%s" "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d "\n"
}

ssh_windows() {
  if [ -n "$windows_ssh_key" ]; then
    ssh -o BatchMode=yes -o ConnectTimeout=10 \
      -o ServerAliveInterval=2 -o ServerAliveCountMax=2 \
      -p "$windows_port" -i "$windows_ssh_key" \
      "$windows_user@$windows_host" "$@"
    return
  fi

  ssh -o BatchMode=yes -o ConnectTimeout=10 \
    -o ServerAliveInterval=2 -o ServerAliveCountMax=2 \
    -p "$windows_port" "$windows_user@$windows_host" "$@"
}

resolve_probe_host() {
  resolved_host="$(ssh -G "$windows_host" 2>/dev/null | awk '
    tolower($1) == "hostname" {
      print $2
      exit
    }
  ')"

  if [ -n "$resolved_host" ]; then
    printf "%s" "$resolved_host"
    return
  fi

  printf "%s" "$windows_host"
}

if [ -z "$windows_host" ] || [ -z "$windows_user" ]; then
  echo "Windows QA target is not configured." >&2
  echo "Set REMOTE_QA_WINDOWS_HOST and REMOTE_QA_WINDOWS_USER." >&2
  echo "You can place them in ignored .remote-qa.env." >&2
  exit 1
fi

run_direct_probe() {
  if ! command -v nc >/dev/null 2>&1; then
    echo "Windows QA probe requires nc on this host." >&2
    exit 127
  fi

  if ! command -v ssh >/dev/null 2>&1; then
    echo "Windows QA probe requires ssh on this host." >&2
    exit 127
  fi

  if ! command -v iconv >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
    echo "Windows QA probe requires iconv and base64 on this host." >&2
    exit 127
  fi

  echo "Checking Windows SSH port..."
  probe_host="$(resolve_probe_host)"
  nc -vz -w 10 "$probe_host" "$windows_port"

  echo "Checking Windows OpenSSH banner and PowerShell..."
  probe_command="$(ps_encoded "\$ProgressPreference = 'SilentlyContinue'
\$PSVersionTable.PSVersion.ToString()")"
  ssh_windows powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand "$probe_command"
}

run_macos_intermediary_probe() {
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
REMOTE_QA_WINDOWS_SSH_KEY='"$(quote "$windows_ssh_key")"' \
scripts/remote/windows-qa/probe.sh
'

  "$macos_runner" --shell "$remote_command"
}

case "$transport" in
  direct)
    run_direct_probe
    ;;
  macos | crabbox)
    run_macos_intermediary_probe
    ;;
  *)
    echo "Unsupported REMOTE_QA_WINDOWS_TRANSPORT: $transport" >&2
    echo "Use direct or macos." >&2
    exit 2
    ;;
esac
