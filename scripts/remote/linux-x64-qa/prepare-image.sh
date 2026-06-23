#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"

image="${REMOTE_QA_LINUX_X64_IMAGE:-ytm-enhancer-ubuntu-amd64:24.04}"
base_image="${REMOTE_QA_LINUX_X64_BASE_IMAGE:-ubuntu:24.04}"
runtime="${REMOTE_QA_LINUX_CONTAINER_RUNTIME:-docker}"

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

if [ ! -x "$macos_runner" ]; then
  echo "macOS QA runner is missing or not executable: $macos_runner" >&2
  exit 1
fi

remote_command="
set -eu
runtime=$(quote "$runtime")
image=$(quote "$image")
base_image=$(quote "$base_image")

if ! command -v \"\$runtime\" >/dev/null 2>&1; then
  echo \"Linux x64 QA requires '\$runtime' on the remote Mac.\" >&2
  echo \"Install Docker CLI and start Docker Desktop or Colima, then retry.\" >&2
  exit 127
fi

if ! \"\$runtime\" info >/dev/null 2>&1; then
  echo \"Linux x64 QA could not reach the '\$runtime' daemon.\" >&2
  echo \"Start Docker Desktop or Colima as the remote QA user, then retry.\" >&2
  exit 127
fi

if \"\$runtime\" image inspect \"\$image\" >/dev/null 2>&1; then
  existing_arch=\"\$(\"\$runtime\" image inspect \"\$image\" --format '{{.Architecture}}')\"
  if [ \"\$existing_arch\" = amd64 ]; then
    echo \"\$image already exists for amd64.\"
    \"\$runtime\" run --rm \"\$image\" uname -m
    exit 0
  fi

  echo \"Replacing \$image because it is \$existing_arch, not amd64.\" >&2
  \"\$runtime\" image rm \"\$image\" >/dev/null
fi

cid=\"\$(\"\$runtime\" create --platform linux/amd64 \"\$base_image\" true)\"
cleanup() {
  \"\$runtime\" rm \"\$cid\" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

\"\$runtime\" commit \"\$cid\" \"\$image\" >/dev/null
arch=\"\$(\"\$runtime\" image inspect \"\$image\" --format '{{.Architecture}}')\"
if [ \"\$arch\" != amd64 ]; then
  echo \"Expected \$image to be amd64, got \$arch.\" >&2
  exit 1
fi

\"\$runtime\" run --rm \"\$image\" uname -m
"

"$macos_runner" --shell "$remote_command"
