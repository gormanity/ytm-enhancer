#!/usr/bin/env sh
set -u

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

usage() {
  echo "Usage: $0 --list | <platform> <suite> [suite arguments...]" >&2
  echo "Platforms: macos, linux, linux-x64, windows" >&2
}

list_suites() {
  cat <<'EOF'
macos/check	CI-equivalent project checks
macos/e2e	Chromium, Edge, and Firefox browser smoke
macos/menu-bar-buttons	native messaging and menu bar button automation
macos/menu-bar-package	menu bar package construction and contents
macos/cli	CLI build and unit tests
linux/check	CI-equivalent project checks
linux/e2e	Chromium and Firefox browser smoke
linux/cli	CLI build and unit tests
linux/cli-connector	Chromium and Firefox CLI native messaging
linux-x64/check	CI-equivalent project checks on amd64
linux-x64/e2e	opt-in emulated amd64 browser smoke
windows/probe	SSH transport and PowerShell readiness
windows/check	Windows-native project checks
windows/e2e	Edge browser smoke
windows/tray	tray build and unit smoke
windows/tray-buttons	Edge and Firefox tray button automation
windows/tray-contention	Firefox native host contention
windows/tray-live-update	installed tray update automation
windows/tray-operational	published installer operational smoke
windows/tray-package	tray release package construction and contents
windows/tray-release	published install, update, and uninstall
windows/tray-sac	Smart App Control installer validation
windows/tray-screenshot	release screenshot capture
windows/tray-signing	disposable certificate signing smoke
windows/tray-visual	live tray popup visual automation
EOF
}

if [ "${1:-}" = "--list" ] || [ "${1:-}" = "list" ]; then
  list_suites
  exit 0
fi

if [ "$#" -lt 2 ]; then
  usage
  exit 2
fi

platform="$1"
suite="$2"
shift 2

case "$platform/$suite" in
  macos/check)
    runner="$script_dir/macos-qa/check.sh"
    contract="CI-equivalent project checks"
    ;;
  macos/e2e)
    runner="$script_dir/macos-qa/e2e-smoke.sh"
    contract="Chromium, Edge, and Firefox browser smoke"
    ;;
  macos/menu-bar-buttons)
    runner="$script_dir/macos-qa/menu-bar-button-smoke.sh"
    contract="native messaging and menu bar button automation"
    ;;
  macos/menu-bar-package)
    runner="$script_dir/macos-qa/menu-bar-package-smoke.sh"
    contract="menu bar package construction and contents"
    ;;
  macos/cli)
    runner="$script_dir/macos-qa/cli-smoke.sh"
    contract="CLI build and unit tests"
    ;;
  linux/check)
    runner="$script_dir/linux-qa/check.sh"
    contract="CI-equivalent project checks"
    ;;
  linux/e2e)
    runner="$script_dir/linux-qa/e2e-smoke.sh"
    contract="Chromium and Firefox browser smoke"
    ;;
  linux/cli)
    runner="$script_dir/linux-qa/cli-smoke.sh"
    contract="CLI build and unit tests"
    ;;
  linux/cli-connector)
    runner="$script_dir/linux-qa/cli-connector-smoke.sh"
    contract="Chromium and Firefox CLI native messaging"
    ;;
  linux-x64/check)
    runner="$script_dir/linux-x64-qa/check.sh"
    contract="CI-equivalent project checks on amd64"
    ;;
  linux-x64/e2e)
    runner="$script_dir/linux-x64-qa/e2e-smoke.sh"
    contract="opt-in emulated amd64 browser smoke"
    ;;
  windows/probe)
    runner="$script_dir/windows-qa/probe.sh"
    contract="SSH transport and PowerShell readiness"
    ;;
  windows/check)
    runner="$script_dir/windows-qa/check.sh"
    contract="Windows-native project checks"
    ;;
  windows/e2e)
    runner="$script_dir/windows-qa/e2e-edge-smoke.sh"
    contract="Edge browser smoke"
    ;;
  windows/tray)
    runner="$script_dir/windows-qa/tray-smoke.sh"
    contract="tray build and unit smoke"
    ;;
  windows/tray-buttons)
    runner="$script_dir/windows-qa/tray-button-smoke.sh"
    contract="Edge and Firefox tray button automation"
    ;;
  windows/tray-contention)
    runner="$script_dir/windows-qa/tray-contention-smoke.sh"
    contract="Firefox native host contention"
    ;;
  windows/tray-live-update)
    runner="$script_dir/windows-qa/tray-live-update-smoke.sh"
    contract="installed tray update automation"
    ;;
  windows/tray-operational)
    runner="$script_dir/windows-qa/tray-operational-smoke.sh"
    contract="published installer operational smoke"
    ;;
  windows/tray-package)
    runner="$script_dir/windows-qa/tray-package-smoke.sh"
    contract="tray release package construction and contents"
    ;;
  windows/tray-release)
    runner="$script_dir/windows-qa/tray-release-e2e.sh"
    contract="published install, update, and uninstall"
    ;;
  windows/tray-sac)
    runner="$script_dir/windows-qa/tray-sac-smoke.sh"
    contract="Smart App Control installer validation"
    ;;
  windows/tray-screenshot)
    runner="$script_dir/windows-qa/tray-release-screenshot.sh"
    contract="release screenshot capture"
    ;;
  windows/tray-signing)
    runner="$script_dir/windows-qa/tray-signing-smoke.sh"
    contract="disposable certificate signing smoke"
    ;;
  windows/tray-visual)
    runner="$script_dir/windows-qa/tray-visual-smoke.sh"
    contract="live tray popup visual automation"
    ;;
  *)
    echo "Unknown QA suite: $platform/$suite" >&2
    usage
    exit 2
    ;;
esac

echo "QA START $platform/$suite"
if "$runner" "$@"; then
  status=0
else
  status=$?
fi

if [ "$status" -eq 0 ]; then
  echo "QA VERIFIED $platform/$suite: $contract"
else
  echo "QA FAILED $platform/$suite (exit $status)" >&2
fi

exit "$status"
