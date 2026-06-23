#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"

projects="${REMOTE_QA_LINUX_E2E_PROJECTS:-chromium}"
runtime="${REMOTE_QA_LINUX_E2E_RUNTIME:-docker}"
platform="${REMOTE_QA_LINUX_E2E_PLATFORM:-linux/arm64}"
image="${REMOTE_QA_LINUX_E2E_IMAGE:-mcr.microsoft.com/playwright:v1.60.0-noble}"
pnpm_version="${REMOTE_QA_LINUX_E2E_PNPM_VERSION:-11.9.0}"

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

if [ ! -x "$macos_runner" ]; then
  echo "macOS QA runner is missing or not executable: $macos_runner" >&2
  exit 1
fi

project_args=""
for project in $projects; do
  project_args="$project_args --project=$project"
done

inner_script="corepack enable && corepack prepare pnpm@$pnpm_version --activate && CI=true pnpm install --frozen-lockfile && CI=true pnpm run build:chrome && CI=true pnpm run dev:build:wc && CI=true pnpm exec playwright test tests/e2e$project_args"

remote_command="set -eu;"
remote_command="$remote_command if ! command -v $(quote "$runtime") >/dev/null 2>&1; then echo $(quote "Linux e2e requires '$runtime' on the remote Mac.") >&2; echo $(quote "Install Docker CLI and start Docker Desktop or Colima as the remote QA user, then retry.") >&2; exit 127; fi;"
remote_command="$remote_command if ! $(quote "$runtime") info >/dev/null 2>&1; then echo $(quote "Linux e2e could not reach the '$runtime' daemon on the remote Mac.") >&2; echo $(quote "Start Docker Desktop or Colima as the remote QA user, then retry.") >&2; exit 127; fi;"
remote_command="$remote_command exec $(quote "$runtime") run --rm --ipc=host --platform $(quote "$platform") -v \"\$PWD:/work\" -w /work $(quote "$image") /bin/bash -lc $(quote "$inner_script")"

"$macos_runner" --shell "$remote_command"
