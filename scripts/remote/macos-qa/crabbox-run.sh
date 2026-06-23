#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
config_file="${REMOTE_QA_CONFIG:-$repo_root/.remote-qa.env}"

if [ -f "$config_file" ]; then
  # shellcheck disable=SC1090
  . "$config_file"
fi

host="${REMOTE_QA_HOST:-}"
user="${REMOTE_QA_USER:-}"
port="${REMOTE_QA_PORT:-22}"
work_root="${REMOTE_QA_WORK_ROOT:-}"
ssh_key="${REMOTE_QA_SSH_KEY:-${CRABBOX_SSH_KEY:-}}"

if ! command -v crabbox >/dev/null 2>&1; then
  echo "crabbox is required." >&2
  echo "Install it with: brew install openclaw/tap/crabbox" >&2
  exit 127
fi

if [ -z "$host" ] || [ -z "$user" ] || [ -z "$work_root" ]; then
  echo "Remote QA target is not configured." >&2
  echo "Set REMOTE_QA_HOST, REMOTE_QA_USER, and REMOTE_QA_WORK_ROOT." >&2
  echo "You can place them in ignored .remote-qa.env." >&2
  exit 1
fi

if [ -z "$ssh_key" ]; then
  echo "Remote QA SSH key is not configured." >&2
  echo "Set REMOTE_QA_SSH_KEY or CRABBOX_SSH_KEY." >&2
  exit 1
fi

if [ ! -r "$ssh_key" ]; then
  echo "Remote QA SSH key not found or not readable: $ssh_key" >&2
  exit 1
fi

CRABBOX_SSH_KEY="$ssh_key" exec crabbox run \
  --provider ssh \
  --target macos \
  --static-host "$host" \
  --static-user "$user" \
  --static-port "$port" \
  --static-work-root "$work_root" \
  "$@"
