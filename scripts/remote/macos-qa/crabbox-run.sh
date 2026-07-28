#!/usr/bin/env sh
set -eu
set +x

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
config_file="${REMOTE_QA_CONFIG:-$repo_root/.remote-qa.env}"
redactor="$repo_root/scripts/remote/redact-private-output.mjs"

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
  echo "Remote QA SSH key not found or not readable." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || [ ! -r "$redactor" ]; then
  echo "Remote QA output redaction helper is unavailable." >&2
  exit 127
fi

temp_dir=""
stdout_file=""
stderr_file=""

cleanup() {
  if [ -n "$stdout_file" ]; then
    rm -f -- "$stdout_file" || :
  fi
  if [ -n "$stderr_file" ]; then
    rm -f -- "$stderr_file" || :
  fi
  if [ -n "$temp_dir" ]; then
    rmdir -- "$temp_dir" 2>/dev/null || :
  fi
}

handle_signal() {
  signal="$1"
  trap - "$signal"
  cleanup
  kill -s "$signal" "$$"
}

trap cleanup EXIT
trap 'handle_signal HUP' HUP
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM

previous_umask="$(umask)"
umask 077
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/ytme-crabbox-output.XXXXXX")"
stdout_file="$temp_dir/stdout"
stderr_file="$temp_dir/stderr"
: >"$stdout_file"
: >"$stderr_file"
umask "$previous_umask"

if CRABBOX_SSH_KEY="$ssh_key" crabbox run \
  --provider ssh \
  --target macos \
  --static-host "$host" \
  --static-user "$user" \
  --static-port "$port" \
  --static-work-root "$work_root" \
  "$@" >"$stdout_file" 2>"$stderr_file"; then
  crabbox_status=0
else
  crabbox_status=$?
fi

if ! YTME_REDACT_REMOTE_HOST="$host" \
  YTME_REDACT_REMOTE_USER="$user" \
  YTME_REDACT_REMOTE_WORK_ROOT="$work_root" \
  YTME_REDACT_REMOTE_SSH_KEY="$ssh_key" \
  YTME_REDACT_WINDOWS_REMOTE_HOST="${REMOTE_QA_WINDOWS_HOST:-}" \
  YTME_REDACT_WINDOWS_REMOTE_USER="${REMOTE_QA_WINDOWS_USER:-}" \
  YTME_REDACT_WINDOWS_REMOTE_WORK_ROOT="${REMOTE_QA_WINDOWS_WORK_ROOT:-}" \
  YTME_REDACT_WINDOWS_REMOTE_SSH_KEY="${REMOTE_QA_WINDOWS_SSH_KEY:-}" \
  node "$redactor" "$stdout_file"; then
  echo "Remote QA output could not be rendered safely." >&2
  exit 1
fi

if ! YTME_REDACT_REMOTE_HOST="$host" \
  YTME_REDACT_REMOTE_USER="$user" \
  YTME_REDACT_REMOTE_WORK_ROOT="$work_root" \
  YTME_REDACT_REMOTE_SSH_KEY="$ssh_key" \
  YTME_REDACT_WINDOWS_REMOTE_HOST="${REMOTE_QA_WINDOWS_HOST:-}" \
  YTME_REDACT_WINDOWS_REMOTE_USER="${REMOTE_QA_WINDOWS_USER:-}" \
  YTME_REDACT_WINDOWS_REMOTE_WORK_ROOT="${REMOTE_QA_WINDOWS_WORK_ROOT:-}" \
  YTME_REDACT_WINDOWS_REMOTE_SSH_KEY="${REMOTE_QA_WINDOWS_SSH_KEY:-}" \
  node "$redactor" "$stderr_file" >&2; then
  echo "Remote QA output could not be rendered safely." >&2
  exit 1
fi

exit "$crabbox_status"
