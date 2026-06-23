#!/usr/bin/env sh
set -eu

if [ "${REMOTE_QA_LINUX_X64_ALLOW_EMULATED_BROWSER_E2E:-}" != "1" ]; then
  echo "Linux x64 browser e2e is disabled by default on the remote Mac." >&2
  echo "Chromium under amd64 emulation on Apple silicon crashed during validation." >&2
  echo "Use scripts/remote/linux-qa/e2e-smoke.sh for native arm64 Linux browser e2e," >&2
  echo "or use a real amd64 Linux host for x64 browser e2e coverage." >&2
  echo "Set REMOTE_QA_LINUX_X64_ALLOW_EMULATED_BROWSER_E2E=1 to try anyway." >&2
  exit 2
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
linux_runner="$repo_root/scripts/remote/linux-qa/e2e-smoke.sh"

REMOTE_QA_LINUX_E2E_PLATFORM="${REMOTE_QA_LINUX_X64_E2E_PLATFORM:-linux/amd64}" \
  REMOTE_QA_LINUX_E2E_IMAGE="${REMOTE_QA_LINUX_X64_E2E_IMAGE:-mcr.microsoft.com/playwright:v1.60.0-noble}" \
  REMOTE_QA_LINUX_E2E_RUNTIME="${REMOTE_QA_LINUX_CONTAINER_RUNTIME:-docker}" \
  "$linux_runner"
