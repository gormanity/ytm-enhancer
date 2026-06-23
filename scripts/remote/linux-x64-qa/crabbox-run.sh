#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
linux_runner="$repo_root/scripts/remote/linux-qa/crabbox-run.sh"

REMOTE_QA_LINUX_PROVIDER="${REMOTE_QA_LINUX_X64_PROVIDER:-local-container}" \
  REMOTE_QA_LINUX_ARCH="${REMOTE_QA_LINUX_X64_ARCH:-amd64}" \
  REMOTE_QA_LINUX_CONTAINER_IMAGE="${REMOTE_QA_LINUX_X64_IMAGE:-ytm-enhancer-ubuntu-amd64:24.04}" \
  REMOTE_QA_LINUX_TTL="${REMOTE_QA_LINUX_X64_TTL:-45m}" \
  REMOTE_QA_LINUX_IDLE_TIMEOUT="${REMOTE_QA_LINUX_X64_IDLE_TIMEOUT:-10m}" \
  "$linux_runner" "$@"
