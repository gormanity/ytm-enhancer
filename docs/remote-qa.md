# Remote QA

This project can use a dedicated remote macOS host for validation. The host is
useful for repeatable browser-extension builds, connector tests, menu bar
packaging checks, and operational QA that should not disturb the main
development machine.

## Privacy Boundary

Do not commit personal network details, hostnames, usernames, SSH key paths, or
machine-specific credentials to this repository. Configure those values locally
through environment variables or the ignored `.remote-qa.env` file.

The remote QA user should be non-admin. Do not install Apple Developer
certificates, App Store Connect keys, or release-signing secrets into this
account. Release signing remains a separate workflow.

## Hosted CI Boundary

Hosted GitHub Actions uses only standard GitHub-hosted runners for this public
repository. Do not add larger runners, custom paid runner classes, or default
artifact uploads to PR QA workflows.

Hosted CI covers deterministic checks that do not need a logged-in desktop:

- `Browser E2E` runs Chromium and Firefox extension E2E on `ubuntu-latest`.
- `Windows QA` runs non-GUI Windows tray scaffold, manifest, registry, runtime
  package, combined-installer, and update-manifest smokes on `windows-latest`.
- `Menu Bar Update Path Tests` runs package and update-path checks on
  `macos-latest`.

Bowfin, UTM, macOS Accessibility automation, and Windows UI Automation remain
local-development QA paths. Keep menu bar button smoke, Windows tray visual
smoke, and Windows tray button smoke out of hosted PR CI.

## Local Configuration

Create `.remote-qa.env` in the repository root:

```sh
REMOTE_QA_HOST="<host-or-ip>"
REMOTE_QA_USER="<ssh-user>"
REMOTE_QA_PORT="22"
REMOTE_QA_WORK_ROOT="<remote-work-root>"
REMOTE_QA_SSH_KEY="$HOME/.ssh/<private-key>"
```

`.remote-qa.env` is ignored by Git. Agents should never print or commit the real
values from this file.

## Direct SSH Smoke

Use direct SSH when validating a persistent checkout on the remote host. This
command assumes you have a local SSH alias configured outside the repository:

```sh
ssh <remote-qa-alias> '
  cd <remote-checkout>/ytm-enhancer &&
  jj git fetch &&
  jj new main@origin &&
  env CI=true pnpm install --frozen-lockfile &&
  env CI=true pnpm run dev:build:wc
'
```

This proves the persistent remote checkout can refresh from `main`, install with
the pinned package manager, and build the development extension targets.

## macOS On Bowfin

Bowfin is the default remote macOS QA host for this project. Keep its concrete
hostname, username, SSH key path, and work root in `.remote-qa.env` or shell
environment only; do not commit them.

## Crabbox Smoke

Crabbox is useful when an agent or developer wants to sync the current local
working tree to the remote host and run the command remotely. This is different
from the direct SSH smoke above: Crabbox validates the local checkout exactly as
it exists, including unpushed changes.

Install Crabbox locally:

```sh
brew install openclaw/tap/crabbox
```

Crabbox static SSH does not automatically inherit the `IdentityFile` from an
OpenSSH host alias. Provide the private key through `.remote-qa.env`,
`REMOTE_QA_SSH_KEY`, or `CRABBOX_SSH_KEY`.

Run a minimal smoke:

```sh
scripts/remote/macos-qa/crabbox-run.sh -- echo ok
```

Run the full remote check:

```sh
scripts/remote/macos-qa/check.sh
```

This mirrors the GitHub Actions CI validation and adds a dev build. It does not
run Playwright e2e because those tests need browser runtime setup and can be
more sensitive to the remote session.

Run a menu bar release package smoke:

```sh
scripts/remote/macos-qa/menu-bar-package-smoke.sh
```

This builds the direct install package with a non-secret throwaway Sparkle
public key, expands the generated `.pkg`, and verifies that the app bundle,
direct uninstaller, and browser native messaging manifests are present in the
package payload. It does not install the package or require Apple signing,
notarization, or release secrets.

Run the menu bar button smoke from any active macOS desktop session:

```sh
scripts/macos-qa/menu-bar-button-smoke.sh
```

This installs a temporary local menu bar app and native messaging manifests,
loads the Chromium dev extension, writes a manifest into Playwright's temporary
Chromium profile, enables Connected Apps, clicks the menu bar
playback/focus/quit controls through macOS Accessibility automation, and
verifies the browser fixture receives the expected playback events. It also
loads deliberately long metadata and waits for the menu bar scroller to report
that overflowing text advanced. The macOS account must be logged into an active
desktop session, and the shell running the script must be allowed to control the
computer in System Settings > Privacy & Security > Accessibility. If that macOS
Accessibility path is unavailable, the test still validates the browser native
messaging connection and then reports the menu-item click portion as skipped
with the System Events error.

Run the same smoke on bowfin through Crabbox:

```sh
scripts/remote/macos-qa/menu-bar-button-smoke.sh
```

The remote wrapper only syncs the checkout to bowfin and runs the local smoke
script there. Keep machine-specific endpoint details in ignored environment
configuration.

Require the actual menu bar button clicks to run:

```sh
YTME_MENU_BAR_REQUIRE_BUTTONS=1 \
  scripts/macos-qa/menu-bar-button-smoke.sh
```

Use that strict mode for manual QA after granting Accessibility/Automation to
the GUI-launched shell or automation app.

The Crabbox wrapper accepts the equivalent remote variable:

```sh
REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS=1 \
  scripts/remote/macos-qa/menu-bar-button-smoke.sh
```

By default the button smoke uses Playwright's managed Chromium project. To use
Firefox or the system Microsoft Edge app instead:

```sh
YTME_MENU_BAR_E2E_PROJECT=firefox \
  scripts/macos-qa/menu-bar-button-smoke.sh

YTME_MENU_BAR_E2E_PROJECT=edge \
  scripts/macos-qa/menu-bar-button-smoke.sh
```

Use `REMOTE_QA_MENU_BAR_E2E_PROJECT=firefox` or
`REMOTE_QA_MENU_BAR_E2E_PROJECT=edge` with the Crabbox wrapper.

The menu bar connector smoke supports Chromium, Edge, and Firefox. Firefox uses
a Marionette sidecar to install the temporary dev add-on because Playwright does
not expose Firefox WebExtension loading directly.

Peekaboo can be useful for manual visual inspection from an active GUI terminal,
but the automated smoke does not depend on it. The smoke uses System Events and
CoreGraphics because those APIs work from the same endpoint shell the runner
uses.

Run managed-browser e2e smoke tests:

```sh
scripts/remote/macos-qa/e2e-smoke.sh
```

By default this runs Chromium and Firefox, which are installed and managed by
Playwright. To include the system Microsoft Edge app:

```sh
REMOTE_QA_E2E_PROJECTS="chromium firefox edge" \
  scripts/remote/macos-qa/e2e-smoke.sh
```

Edge can be unstable over a headless SSH session on macOS. If Edge closes before
test code runs, retry from an active Screen Sharing session or treat Edge as a
manual browser smoke target.

## Linux On The Remote Mac

The remote macOS host can also act as a bridge to ephemeral Linux VMs. This is
useful for validating Linux CLI behavior and Linux browser-extension tests
without storing private host details in the repository.

The default Linux path is:

```text
local checkout
  -> Crabbox static SSH
  -> remote macOS QA account
  -> Crabbox apple-vz Linux VM
```

This requires Crabbox on the remote macOS host. The Linux VM is created and
removed by Crabbox for each run. It does not require committing a Linux
hostname, username, VM name, IP address, or local network detail.

Run a minimal Linux smoke:

```sh
scripts/remote/linux-qa/crabbox-run.sh -- uname -a
```

Run the Linux check:

```sh
scripts/remote/linux-qa/check.sh
```

Run Linux browser e2e through the official Playwright Docker image on the remote
Mac:

```sh
scripts/remote/linux-qa/e2e-smoke.sh
```

This uses the remote Mac only as a private Docker host. The default target is
`linux/arm64` and the image is pinned to the Playwright version used by the
project. The container runs with `--ipc=host`, matching Playwright's Docker
guidance for Chromium stability. This avoids two unstable paths:

- installing browser dependencies into the current Crabbox `apple-vz` Ubuntu VM
  image
- running Chromium as `linux/amd64` under Apple silicon emulation

The default browser project is Chromium. Override the project list locally when
needed:

```sh
REMOTE_QA_LINUX_E2E_PROJECTS="chromium firefox" \
  scripts/remote/linux-qa/e2e-smoke.sh
```

Run the Linux CLI smoke from a checkout that includes the CLI connector app:

```sh
scripts/remote/linux-qa/cli-smoke.sh
```

Run the true Linux CLI connector smoke:

```sh
scripts/remote/linux-qa/cli-connector-smoke.sh
```

This runs inside the official Playwright Linux container on the remote Mac,
installs `ytme` as a Linux native messaging host into throwaway browser config
directories, loads the dev extension in Chromium and Firefox, enables Connected
Apps, and verifies `ytme play`, `ytme pause`, `ytme next`, and `ytme previous`
route through the extension into a YouTube Music fixture. Override the browser
list when a narrower smoke is useful:

```sh
REMOTE_QA_LINUX_CLI_CONNECTOR_PROJECTS=firefox \
  scripts/remote/linux-qa/cli-connector-smoke.sh
```

The Linux VM image is intentionally minimal. The Linux scripts bootstrap Node,
pnpm, and Go inside the VM as needed. This keeps the remote macOS account clean,
but the first run is slower because it downloads toolchains and browser
dependencies.

The default Linux provider is Crabbox `apple-vz`. Override it only from local
environment if another provider is more appropriate:

```sh
REMOTE_QA_LINUX_PROVIDER=apple-vz
REMOTE_QA_LINUX_TTL=45m
REMOTE_QA_LINUX_IDLE_TIMEOUT=10m
REMOTE_QA_LINUX_CPUS=4
REMOTE_QA_LINUX_MEMORY=8192
REMOTE_QA_LINUX_DISK=30
```

Optional toolchain overrides:

```sh
REMOTE_QA_LINUX_NODE_VERSION=24.11.1
REMOTE_QA_LINUX_PNPM_VERSION=11.9.0
REMOTE_QA_LINUX_GO_VERSION=1.26.4
```

## Linux x64 Target

Use the x64 Linux target for Linux `amd64` CLI builds, unit tests, and packaging
confidence. This still runs only on the remote Mac Mini: the local checkout
syncs to the remote macOS account, then the inner Crabbox run starts an `amd64`
Linux container through a local container runtime installed on that Mac.

This target does not use cloud capacity. It requires a Docker-compatible local
container runtime on the remote Mac, such as Docker Desktop or Colima. Without
that runtime, the x64 scripts will fail during provider startup.

The default x64 target settings are:

```sh
REMOTE_QA_LINUX_X64_PROVIDER=local-container
REMOTE_QA_LINUX_X64_ARCH=amd64
REMOTE_QA_LINUX_X64_IMAGE=ytm-enhancer-ubuntu-amd64:24.04
REMOTE_QA_LINUX_CONTAINER_RUNTIME=docker
```

The remote Mac must have a local container runtime installed and started before
running these scripts. Install shared Homebrew binaries from the Homebrew-owning
admin account, not from the non-admin QA account:

```sh
brew install colima docker
```

If Homebrew suggests changing `/opt/homebrew` ownership to the QA account, do
not do that. The QA account should stay non-admin and should not own the shared
Homebrew prefix.

Then start Colima from the non-admin QA account so Docker state, sockets, and
container files stay isolated to the QA user. On Apple silicon, prefer the
Virtualization.framework backend with Rosetta when available:

```sh
colima start --vm-type=vz --vz-rosetta --cpu 4 --memory 8 --disk 40
docker run --rm --platform linux/amd64 ubuntu:24.04 uname -m
```

Crabbox local-container bootstrap files must be under a path mounted into
Colima. The x64 runner sets remote `TMPDIR` under the QA user's home directory
for this reason.

Docker resolves multi-arch tags such as `ubuntu:24.04` to the host architecture
by default. Prepare the local amd64-only tag before running x64 QA:

```sh
scripts/remote/linux-x64-qa/prepare-image.sh
```

The command should print `x86_64`.

If Rosetta-backed containers are not available, use an x86_64 Colima VM as the
slower fallback, then prepare the image:

```sh
colima start --arch x86_64 --cpu 4 --memory 8 --disk 40
scripts/remote/linux-x64-qa/prepare-image.sh
```

Run a minimal x64 smoke:

```sh
scripts/remote/linux-x64-qa/crabbox-run.sh -- uname -m
```

Run the x64 Linux build/unit check:

```sh
scripts/remote/linux-x64-qa/check.sh
```

Do not use the x64 target as the normal browser e2e path on Apple silicon.
Chromium crashed under `amd64` emulation during validation. Use the native Linux
browser e2e script above, or run x64 browser e2e on a real `amd64` Linux host.

The x64 browser script is retained for diagnostics only and requires an explicit
opt-in:

```sh
REMOTE_QA_LINUX_X64_ALLOW_EMULATED_BROWSER_E2E=1 \
scripts/remote/linux-x64-qa/e2e-smoke.sh
```

## Windows QA

Windows validation can target either a physical Windows machine over direct SSH
or a Windows VM reachable through a remote macOS intermediary. Prefer direct SSH
for a dedicated Windows PC:

```text
local checkout
  -> Windows OpenSSH target
```

Use the macOS intermediary transport when the Windows target is a VM that is
only reachable from a remote Mac:

```text
local checkout
  -> Crabbox static SSH
  -> remote macOS QA account
  -> Windows OpenSSH guest
```

For a Windows VM on Apple silicon, prefer Windows ARM as the VM architecture.
Use Windows' own x64 app emulation only where a tool does not provide ARM
binaries. Avoid full x86_64 Windows emulation on Apple silicon for browser QA;
it is expected to be slow and brittle.

For a VM, create it with a disposable non-admin QA account, bridged networking
if available, and enough resources for browser builds:

```text
CPU: 4
Memory: 8-12 GB
Disk: 80+ GB
```

For a physical Windows PC, create a dedicated non-admin QA account such as
`codex`, log into that desktop account at least once so its user profile exists,
and keep an administrator account separate for machine setup.

Enable OpenSSH on the Windows target:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
New-NetFirewallRule -Name sshd -DisplayName "OpenSSH Server" `
  -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

For a non-admin QA account, add the public key to the user's own profile and
grant `SYSTEM` read access so OpenSSH can validate the key:

```powershell
$key = "ssh-ed25519 <public-key> <comment>"
$sshDir = "$env:USERPROFILE\.ssh"
$keyPath = "$sshDir\authorized_keys"
$user = "$env:USERDOMAIN\$env:USERNAME"

New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
Set-Content -Path $keyPath -Value $key -Encoding ascii

icacls.exe $sshDir /inheritance:r
icacls.exe $sshDir /grant "$($user):(OI)(CI)F"
icacls.exe $sshDir /grant "*S-1-5-18:(OI)(CI)F"

icacls.exe $keyPath /inheritance:r
icacls.exe $keyPath /grant "$($user):F"
icacls.exe $keyPath /grant "*S-1-5-18:F"
```

The public key must be a single line. Verify the key count before testing from
the local machine:

```powershell
@(Get-Content $keyPath).Count
```

For an administrator QA account, Windows OpenSSH reads keys from
`$env:ProgramData\ssh\administrators_authorized_keys`; prefer a non-admin QA
account for repeatable validation unless a smoke explicitly needs elevation.

Install the Windows toolchain on the target:

- Git
- Node.js matching this repo's supported development version
- Corepack with `pnpm@11.9.0`, or a global `pnpm@11.9.0` install
- Go 1.24 or newer
- Microsoft Edge
- Windows SDK, including `signtool.exe`, for Windows tray signing smoke

Then prepare package-manager state:

```powershell
if (Get-Command corepack -ErrorAction SilentlyContinue) {
  corepack enable
  corepack prepare pnpm@11.9.0 --activate
} else {
  npm install -g pnpm@11.9.0
}

pnpm --version
git config --global core.autocrlf false
```

Configure the Windows target locally through `.remote-qa.env` or shell
environment. Direct SSH is the default transport:

```sh
REMOTE_QA_WINDOWS_TRANSPORT="direct"
REMOTE_QA_WINDOWS_HOST="<windows-host-or-ssh-alias>"
REMOTE_QA_WINDOWS_USER="<windows-qa-user>"
REMOTE_QA_WINDOWS_PORT="22"
REMOTE_QA_WINDOWS_WORK_ROOT="C:/Users/<windows-qa-user>/work/ytm-enhancer"
REMOTE_QA_WINDOWS_SSH_KEY="$HOME/.ssh/<windows-target-key>"
```

Leave pnpm settings unset for the normal repo install layout. If a Windows SSH
session cannot traverse pnpm's junction-backed `node_modules`, use this
target-specific workaround in ignored local config only:

```sh
REMOTE_QA_WINDOWS_PNPM_NODE_LINKER="hoisted"
REMOTE_QA_WINDOWS_PNPM_PACKAGE_IMPORT_METHOD="copy"
```

For a Windows VM reachable only from a remote Mac, use the macOS intermediary
transport:

```sh
REMOTE_QA_WINDOWS_TRANSPORT="macos"
REMOTE_QA_WINDOWS_HOST="<guest-ip-or-forward-host-from-macos>"
REMOTE_QA_WINDOWS_USER="<windows-qa-user>"
REMOTE_QA_WINDOWS_PORT="22"
REMOTE_QA_WINDOWS_WORK_ROOT="C:/Users/<windows-qa-user>/work/ytm-enhancer"
REMOTE_QA_WINDOWS_SSH_KEY="/Users/<macos-qa-user>/.ssh/<windows-target-key>"
```

`REMOTE_QA_WINDOWS_SSH_KEY` is optional when your SSH config resolves the key.
When `REMOTE_QA_WINDOWS_TRANSPORT=direct`, the key path is read on the local
machine. When `REMOTE_QA_WINDOWS_TRANSPORT=macos`, the key path is read on the
remote macOS intermediary because the second SSH hop starts there.

`REMOTE_QA_WINDOWS_WORK_ROOT` is deleted and recreated on every run. Point it at
a disposable repository checkout directory, not a broad parent directory.

Windows UI smoke tests need a small QA agent running inside the logged-in QA
user's desktop session. Install or update the stable per-user agent copy from
macOS:

```sh
scripts/remote/windows-qa/run.sh --shell \
  '& .\scripts\windows-qa\install-ui-agent.ps1'
```

If you are updating an already-running agent, restart it through the current
desktop-session agent after installing the new files:

```sh
scripts/remote/windows-qa/run.sh --preserve-apps --shell '
$agentRoot = Join-Path $env:LOCALAPPDATA "YTM Enhancer\WindowsQaAgent"
$restartScriptPath = Join-Path $env:TEMP "YTMEnhancerWindowsQa-RestartAgent.ps1"
Copy-Item `
  -LiteralPath ".\scripts\windows-qa\restart-ui-agent.ps1" `
  -Destination $restartScriptPath `
  -Force
& (Join-Path $agentRoot "invoke-ui-agent.ps1") `
  -Action Launch `
  -FilePath "powershell.exe" `
  -Arguments @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $restartScriptPath
  )
'
```

Then log into the Windows QA user's desktop and start:

```text
%LOCALAPPDATA%\YTM Enhancer\WindowsQaAgent\start-ui-agent.cmd
```

Leave that window open while UI smoke runs. The agent listens on a same-user
named pipe and moves its own working directory to `%TEMP%`, so the remote sync
wrapper can continue deleting and recreating `REMOTE_QA_WINDOWS_WORK_ROOT`. The
machine can stay locked for SSH, package, release, and signing checks. Real tray
UI smoke is the exception: Windows does not expose the notification area or
popup UI from the lock screen. The UI smoke scripts wait up to
`YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS` seconds for the QA desktop to unlock
before launching the tray app, then fail with a clear `LogonUI` message if the
desktop is still locked.

Treat the unlocked desktop as an explicit contract for UI smoke. The SSH user,
the logged-in desktop user, and the UI agent user should be the same non-admin
QA account. The target can be locked again after the UI smoke finishes, but
button, visual, live-update, and operational tray smokes need the desktop
unlocked for their full run. This is a Windows shell limitation, not a transport
choice: SSH, package, release, signing, and non-GUI checks remain usable while
the target is locked.

Probe the running agent through the configured transport:

```sh
agent='$env:LOCALAPPDATA\YTM Enhancer\WindowsQaAgent'
probe="& '$agent\invoke-ui-agent.ps1' -Action Probe -LaunchProbe"
scripts/remote/windows-qa/run.sh --shell "$probe"
```

Run the Windows SSH preflight before a full Windows QA sync:

```sh
scripts/remote/windows-qa/probe.sh
```

The probe verifies that the selected transport can reach the Windows SSH port
and that the Windows target returns an OpenSSH banner before PowerShell runs. It
does not copy the repository into Windows.

Run a minimal Windows smoke through the configured transport:

```sh
scripts/remote/windows-qa/run.sh -- powershell.exe -NoProfile \
  -Command '$PSVersionTable.PSVersion.ToString()'
```

`scripts/remote/windows-qa/crabbox-run.sh` remains as a compatibility alias for
the macOS intermediary transport. Prefer `run.sh` in new docs and automation.

If `nc` can connect to the forwarded port from the remote Mac, but SSH fails
before authentication with `Connection timed out during banner exchange` or
`kex_exchange_identification`, the wrapper has reached the Windows target and
the failure is inside Windows. From the Windows desktop, double-click
`scripts/windows-qa/repair-openssh.cmd` to request administrator permission,
repair OpenSSH Server, restore the firewall rule, fix
`administrators_authorized_keys` ACLs when that file exists, and write a log to
the Desktop.

If a manual repair is easier, run this in an elevated Windows PowerShell
session:

```powershell
Set-Service sshd -StartupType Automatic
Start-Service sshd

$ruleName = "OpenSSH-Server-In-TCP"
if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
  Enable-NetFirewallRule -Name $ruleName
  Set-NetFirewallRule -Name $ruleName -Profile Any -Action Allow
} else {
  New-NetFirewallRule `
    -Name $ruleName `
    -DisplayName "OpenSSH Server (sshd)" `
    -Enabled True `
    -Direction Inbound `
    -Protocol TCP `
    -Action Allow `
    -LocalPort 22 `
    -Profile Any
}

Get-Service sshd
Get-NetTCPConnection -LocalPort 22 -State Listen
```

Run the Windows build/unit check:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa/check.ps1
```

Run the same check through the configured Windows transport:

```sh
scripts/remote/windows-qa/check.sh
```

This uses Windows-native PowerShell instead of `pnpm run check` because some
package scripts use POSIX environment syntax. It validates formatting, lint,
dead CSS, data roles, TypeScript, Vitest, Go tests, Chrome/Firefox/Edge builds,
Firefox add-on lint, and an Edge dev build.

Run a Windows Edge browser smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/e2e-edge-smoke.ps1
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/e2e-edge-smoke.sh
```

This runs the Playwright `edge` project against the system Microsoft Edge app in
Windows. General Windows browser E2E remains scoped to Edge; the tray connector
button smoke covers Edge and Firefox.

Windows CLI native messaging QA is not wired yet. The current CLI native-host
install scripts and connector e2e smoke target macOS/Linux paths. Windows CLI
support remains intentionally out of scope; the user-facing Windows Connected
App is the tray connector.

Run the Windows tray connector smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa/tray-smoke.ps1
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-smoke.sh
```

This requires a .NET SDK that can build .NET 10 projects plus the .NET 10
runtime on the Windows target. The `Microsoft.DotNet.SDK.10` winget package
provides both. It runs the dependency-free tray tests, publishes the WinForms
tray executable and native host relay for the target architecture, installs
user-level Edge, Chrome, and Firefox native messaging registry keys, validates
the Chromium and Firefox manifests, and removes the smoke install.

Run the Windows tray release package smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-package-smoke.ps1
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-package-smoke.sh
```

This builds both architecture-specific updater zips, generates
`YTM-Tray-update.json`, runs `pnpm run windows-tray:installer`, and installs
through the combined offline EXE. It verifies that the installer selected the
native runtime, validates both archives plus the package metadata and manifest,
and removes the smoke install.

Run the Windows tray published release E2E smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-release-e2e.ps1
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-release-e2e.sh
```

This deliberately uses the architecture-specific updater zips. It downloads
published `windows-tray-v*` assets from GitHub, installs the baseline release,
fetches the target release's `YTM-Tray-update.json`, verifies the runtime
package checksum, and installs the target release over the baseline. It
validates files, Authenticode signers, registry keys, native host manifests,
Start Menu shortcuts, and uninstall metadata, then runs the installed
uninstaller and verifies cleanup. Pass `-BaselineVersion` and `-TargetVersion`
to validate a different release pair.

Run the Windows tray live-update UI smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-live-update-smoke.ps1 `
  -BaselineVersion 0.1.1 `
  -TargetVersion 0.1.2 `
  -UiReadyTimeoutSeconds 60
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-live-update-smoke.sh 0.1.1 0.1.2
```

This installs the published baseline release into the real user-level install
location, launches the released tray app through the Windows QA UI agent, clicks
the popup update action, accepts the update dialogs, waits for the target
release to replace the baseline, validates the installed files and native host
registrations, then uninstalls and verifies cleanup. It intentionally uses the
default `%LOCALAPPDATA%\YTM Enhancer\Tray` path because the in-app updater hands
off to the native setup inside the selected architecture-specific updater zip.

The remote wrapper also accepts `YTM_WINDOWS_TRAY_BASELINE_VERSION` and
`YTM_WINDOWS_TRAY_TARGET_VERSION` when positional arguments are not convenient.
Set `YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS` to control how long the remote
wrapper waits for the desktop to unlock before UI automation starts.

Run the Windows tray operational smoke when you want to install a published
candidate and keep it in place for manual testing:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-operational-smoke.ps1 `
  -Version 0.1.9 `
  -UiReadyTimeoutSeconds 60
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-operational-smoke.sh 0.1.9
```

This downloads the published `YTM-Tray-<version>-Setup.exe`, verifies its
Authenticode signer, and installs through the same combined offline installer
linked from the website. The installer selects x64 or ARM64 automatically. The
smoke validates the native installed files, native host manifests, browser
registrations, Start Menu shortcuts, and Windows uninstall entry, launches YTM
Tray through the Windows QA UI agent, and opens Google Chrome to YouTube Music.
It intentionally does not uninstall or quit the tray app. Use it after
destructive install/update/uninstall smokes when you want the target left ready
for hands-on operational testing.

Set `YTM_WINDOWS_TRAY_OPERATIONAL_PLAYBACK_URL` to open a specific YouTube Music
URL, or `YTM_WINDOWS_TRAY_OPERATIONAL_SKIP_CHROME=1` to leave Chrome untouched
while still installing and launching YTM Tray.

Run the Windows tray release signing smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-signing-smoke.ps1
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-signing-smoke.sh
```

This creates a disposable self-signed code-signing certificate in the Windows QA
user stores and exports a temporary PFX. It builds and signs both runtime
packages, verifies every inner executable, runs
`pnpm run windows-tray:installer`, and verifies the combined installer's
signature. It then removes the temporary certificate. This validates both
signing passes without installing production signing secrets on the QA target.

Run the Windows tray Smart App Control smoke against the public-trust-signed
combined EXE from the `windows-tray-signed-candidate` signing-check artifact or
an already-published release:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-sac-smoke.ps1 `
  -InstallerPath "$env:USERPROFILE\Downloads\YTM-Tray-0.1.9-Setup.exe"
```

The remote wrapper accepts a path on the Windows target. Keep the installer
outside `REMOTE_QA_WINDOWS_WORK_ROOT`, because the wrapper replaces that
disposable checkout when it syncs:

```sh
scripts/remote/windows-qa/tray-sac-smoke.sh \
  'C:\Users\<windows-qa-user>\Downloads\YTM-Tray-0.1.9-Setup.exe'
```

The smoke requires Smart App Control enforcement to already be on
(`VerifiedAndReputablePolicyState=1`) and an unlocked desktop with the Windows
QA UI agent running. The target must not have an existing YTM Tray install; the
smoke fails rather than replacing user state. It does not change Smart App
Control state, download an installer, create a certificate, or sign binaries. It
adds Internet-zone Mark of the Web to the supplied EXE, requires a valid
public-trust Authenticode signature, and captures Code Integrity and AppLocker
event-log cursors. It then launches the marked combined installer through the
logged-in desktop agent, confirms that it selected the native runtime, validates
the signed installed files and registry entries, and confirms that no CMD or
PowerShell scripts were installed. It starts the installed tray and native host
in the desktop session, requires a real native-host-to-tray bridge handshake,
runs the installed native uninstaller, and verifies cleanup. The smoke fails if
new blocking events identify any release executable, CMD, or PowerShell.

Set `YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS` to control the desktop readiness
wait. Set `YTM_WINDOWS_TRAY_SAC_OPERATION_TIMEOUT_SECONDS` to control install
runtime, and uninstall waits.

Run the Windows tray visual smoke from an active Windows desktop session:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-visual-smoke.ps1 `
  -UiReadyTimeoutSeconds 60
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-visual-smoke.sh
```

This requires the same .NET SDK as the tray smoke and a logged-in desktop for
the QA user. The machine may be locked before the command starts, but it must be
unlocked before the readiness timeout expires and remain unlocked while UI
automation is clicking the tray app. The smoke installs the tray app to a
temporary directory, launches it through the Windows QA UI agent, finds the tray
icon through Windows UI Automation, opens the tray popup, captures
desktop/overflow/popup screenshots under the Windows user's temp directory,
verifies long metadata scrolls, and removes the smoke install.

Regenerate the Windows tray release screenshot from the same active Windows
desktop session. Use the approved Creative Commons YouTube Music track URL so
the checked-in promo image shows live artwork read through the connector, not
fixture artwork:

```powershell
$env:YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL = `
  "https://music.youtube.com/watch?v=<approved-track-id>"
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-release-screenshot.ps1
```

Run the same capture through the configured Windows transport:

```sh
YTME_WINDOWS_TRAY_SCREENSHOT_PLAYBACK_URL=\
"https://music.youtube.com/watch?v=<approved-track-id>" \
scripts/remote/windows-qa/tray-release-screenshot.sh
```

This runs the real Windows tray app against the Edge Connected Apps smoke,
verifies button behavior against the local fixture, switches to the approved
live YouTube Music track for the screenshot, captures the tray popup after
artwork has been downloaded by the tray app, and copies the PNG back to
`apps/windows-tray/release/windows-tray-screenshot.png`.

Run the Windows tray button smoke from an active Windows desktop session:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-button-smoke.ps1
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-button-smoke.sh
```

This installs Playwright's Firefox browser, installs the tray native host,
launches the tray through the active desktop, opens the Edge and Firefox dev
builds with the YouTube Music fixture, enables Connected Apps, clicks the tray
playback/seek/focus/about/quit controls through Windows UI Automation, and
verifies the browser fixture receives the expected events. The browser projects
run serially because the Windows tray process and native messaging registry
entries are user-global resources.

After one browser is connected to the tray app, run the Firefox contention smoke
to verify that a second browser gets explicit ownership guidance:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-contention-smoke.ps1
```

Run the same smoke through the configured Windows transport:

```sh
scripts/remote/windows-qa/tray-contention-smoke.sh
```

Run only the preflight when you want to verify setup without launching Firefox:

```sh
YTME_WINDOWS_TRAY_CONTENTION_PREFLIGHT_ONLY=1 \
scripts/remote/windows-qa/tray-contention-smoke.sh
```

This smoke preserves the active Windows desktop session and existing app
processes. It expects YTM Tray to already be connected to Microsoft Edge (dev),
then launches Firefox and verifies the Connected Apps UI reports that another
browser owns the tray connection. Set `YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL`
when validating a different owning browser label:

```sh
YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL="Google Chrome (dev)" \
scripts/remote/windows-qa/tray-contention-smoke.sh
```

## Connector Smokes

The CLI connector stack is not always present on `main`. Run the CLI smoke only
from a checkout that includes the CLI connector app and `cli:test` script:

```sh
scripts/remote/macos-qa/cli-smoke.sh
```

Run a menu bar packaging smoke:

```sh
scripts/remote/macos-qa/menu-bar-smoke.sh
```

`menu-bar-smoke.sh` is a compatibility alias for `menu-bar-package-smoke.sh`.
The package smoke uses a non-secret throwaway Sparkle public key so the remote
host can validate direct package construction without storing signing
certificates, notarization credentials, or Sparkle private keys.

## Environment Variables

The remote QA scripts accept these variables:

- `REMOTE_QA_CONFIG`
- `REMOTE_QA_HOST`
- `REMOTE_QA_USER`
- `REMOTE_QA_PORT`
- `REMOTE_QA_WORK_ROOT`
- `REMOTE_QA_SSH_KEY`
- `REMOTE_QA_E2E_PROJECTS`
- `REMOTE_QA_MENU_BAR_E2E_PROJECT`
- `REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS`
- `YTME_MENU_BAR_E2E_PROJECT`
- `YTME_MENU_BAR_REQUIRE_BUTTONS`
- `REMOTE_QA_LINUX_PROVIDER`
- `REMOTE_QA_LINUX_TARGET`
- `REMOTE_QA_LINUX_TTL`
- `REMOTE_QA_LINUX_IDLE_TIMEOUT`
- `REMOTE_QA_LINUX_CPUS`
- `REMOTE_QA_LINUX_MEMORY`
- `REMOTE_QA_LINUX_DISK`
- `REMOTE_QA_LINUX_IMAGE`
- `REMOTE_QA_LINUX_CONTAINER_IMAGE`
- `REMOTE_QA_LINUX_CONTAINER_RUNTIME`
- `REMOTE_QA_LINUX_ARCH`
- `REMOTE_QA_LINUX_OS`
- `REMOTE_QA_LINUX_CLASS`
- `REMOTE_QA_LINUX_NODE_VERSION`
- `REMOTE_QA_LINUX_PNPM_VERSION`
- `REMOTE_QA_LINUX_GO_VERSION`
- `REMOTE_QA_LINUX_TOOL_ROOT`
- `REMOTE_QA_LINUX_E2E_PROJECTS`
- `REMOTE_QA_LINUX_E2E_RUNTIME`
- `REMOTE_QA_LINUX_E2E_PLATFORM`
- `REMOTE_QA_LINUX_E2E_IMAGE`
- `REMOTE_QA_LINUX_E2E_PNPM_VERSION`
- `REMOTE_QA_LINUX_CLI_CONNECTOR_PROJECTS`
- `REMOTE_QA_LINUX_X64_PROVIDER`
- `REMOTE_QA_LINUX_X64_ARCH`
- `REMOTE_QA_LINUX_X64_IMAGE`
- `REMOTE_QA_LINUX_X64_TTL`
- `REMOTE_QA_LINUX_X64_IDLE_TIMEOUT`
- `REMOTE_QA_LINUX_X64_ALLOW_EMULATED_BROWSER_E2E`
- `REMOTE_QA_LINUX_X64_E2E_PLATFORM`
- `REMOTE_QA_LINUX_X64_E2E_IMAGE`
- `REMOTE_QA_WINDOWS_TRANSPORT`
- `REMOTE_QA_WINDOWS_HOST`
- `REMOTE_QA_WINDOWS_USER`
- `REMOTE_QA_WINDOWS_PORT`
- `REMOTE_QA_WINDOWS_WORK_ROOT`
- `REMOTE_QA_WINDOWS_SSH_KEY`
- `YTM_WINDOWS_QA_UI_READY_TIMEOUT_SECONDS`

Keep real values local. If the remote address changes, update `.remote-qa.env`
or your shell environment.
