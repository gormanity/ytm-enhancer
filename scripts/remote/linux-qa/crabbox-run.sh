#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"

provider="${REMOTE_QA_LINUX_PROVIDER:-apple-vz}"
target="${REMOTE_QA_LINUX_TARGET:-linux}"
ttl="${REMOTE_QA_LINUX_TTL:-45m}"
idle_timeout="${REMOTE_QA_LINUX_IDLE_TIMEOUT:-10m}"
cpus="${REMOTE_QA_LINUX_CPUS:-4}"
memory="${REMOTE_QA_LINUX_MEMORY:-8192}"
disk="${REMOTE_QA_LINUX_DISK:-30}"
image="${REMOTE_QA_LINUX_IMAGE:-}"
container_image="${REMOTE_QA_LINUX_CONTAINER_IMAGE:-}"
container_runtime="${REMOTE_QA_LINUX_CONTAINER_RUNTIME:-docker}"
arch="${REMOTE_QA_LINUX_ARCH:-}"
os="${REMOTE_QA_LINUX_OS:-}"
machine_class="${REMOTE_QA_LINUX_CLASS:-}"

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

append_arg() {
  remote_command="$remote_command $(quote "$1")"
}

remote_qa_env_value() {
  case "$1" in
    REMOTE_QA_LINUX_NODE_VERSION)
      printf "%s" "${REMOTE_QA_LINUX_NODE_VERSION:-}"
      ;;
    REMOTE_QA_LINUX_GO_VERSION)
      printf "%s" "${REMOTE_QA_LINUX_GO_VERSION:-}"
      ;;
    REMOTE_QA_LINUX_PNPM_VERSION)
      printf "%s" "${REMOTE_QA_LINUX_PNPM_VERSION:-}"
      ;;
    REMOTE_QA_LINUX_TOOL_ROOT)
      printf "%s" "${REMOTE_QA_LINUX_TOOL_ROOT:-}"
      ;;
    *)
      return 1
      ;;
  esac
}

if [ ! -x "$macos_runner" ]; then
  echo "macOS QA runner is missing or not executable: $macos_runner" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 [--shell <script> | -- <command...>]" >&2
  exit 2
fi

remote_command=""

if [ "$provider" = "local-container" ]; then
  remote_command="if ! command -v $(quote "$container_runtime") >/dev/null 2>&1; then echo $(quote "Linux x64 QA requires '$container_runtime' on the remote Mac.") >&2; echo $(quote "Install Docker CLI and start Docker Desktop or Colima on the remote Mac Mini, then retry.") >&2; exit 127; fi;"
  remote_command="$remote_command if ! $(quote "$container_runtime") info >/dev/null 2>&1; then echo $(quote "Linux x64 QA could not reach the '$container_runtime' daemon on the remote Mac.") >&2; echo $(quote "Start Docker Desktop or run Colima as the remote QA user, then retry.") >&2; exit 127; fi;"
  remote_command="$remote_command mkdir -p \"\$HOME/crabbox/tmp\"; TMPDIR=\"\$HOME/crabbox/tmp\""
fi

for env_name in \
  REMOTE_QA_LINUX_NODE_VERSION \
  REMOTE_QA_LINUX_GO_VERSION \
  REMOTE_QA_LINUX_PNPM_VERSION \
  REMOTE_QA_LINUX_TOOL_ROOT; do
  env_value="$(remote_qa_env_value "$env_name")"
  if [ -n "$env_value" ]; then
    append_arg "$env_name=$env_value"
  fi
done

append_arg crabbox
append_arg run
append_arg --provider
append_arg "$provider"
append_arg --target
append_arg "$target"
append_arg --ttl
append_arg "$ttl"
append_arg --idle-timeout
append_arg "$idle_timeout"

if [ -n "$arch" ]; then
  append_arg --arch
  append_arg "$arch"
fi

if [ -n "$os" ]; then
  append_arg --os
  append_arg "$os"
fi

if [ -n "$machine_class" ]; then
  append_arg --class
  append_arg "$machine_class"
fi

for env_name in \
  REMOTE_QA_LINUX_NODE_VERSION \
  REMOTE_QA_LINUX_GO_VERSION \
  REMOTE_QA_LINUX_PNPM_VERSION \
  REMOTE_QA_LINUX_TOOL_ROOT; do
  if [ -n "$(remote_qa_env_value "$env_name")" ]; then
    append_arg --allow-env
    append_arg "$env_name"
  fi
done

if [ "$provider" = "apple-vz" ]; then
  append_arg --apple-vz-cpus
  append_arg "$cpus"
  append_arg --apple-vz-memory
  append_arg "$memory"
  append_arg --apple-vz-disk
  append_arg "$disk"

  if [ -n "$image" ]; then
    append_arg --apple-vz-image
    append_arg "$image"
  fi
fi

if [ "$provider" = "local-container" ]; then
  append_arg --local-container-runtime
  append_arg "$container_runtime"

  if [ -n "$container_image" ]; then
    append_arg --local-container-image
    append_arg "$container_image"
  fi
fi

if [ "${1:-}" = "--shell" ]; then
  if [ "$#" -ne 2 ]; then
    echo "Usage: $0 --shell <script>" >&2
    exit 2
  fi

  append_arg --shell
  append_arg "$2"
else
  if [ "${1:-}" = "--" ]; then
    shift
  fi

  if [ "$#" -eq 0 ]; then
    echo "Usage: $0 -- <command...>" >&2
    exit 2
  fi

  append_arg --
  for arg in "$@"; do
    append_arg "$arg"
  done
fi

"$macos_runner" --shell "$remote_command"
