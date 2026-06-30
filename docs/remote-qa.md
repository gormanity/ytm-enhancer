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
- `Windows QA` runs non-GUI Windows tray scaffold, manifest, registry, package,
  and update-manifest smokes on `windows-latest`.
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

## Windows On Bowfin

Use a persistent Windows 11 ARM VM on the remote Mac for Windows validation. The
intended path is:

```text
local checkout
  -> Crabbox static SSH
  -> remote macOS QA account
  -> Windows OpenSSH guest
```

Prefer Windows ARM as the VM architecture. Use Windows' own x64 app emulation
only where a tool does not provide ARM binaries. Avoid full x86_64 Windows
emulation on Apple silicon for browser QA; it is expected to be slow and
brittle.

Create the VM with a disposable non-admin QA account, bridged networking if
available, and enough resources for browser builds:

```text
CPU: 4
Memory: 8-12 GB
Disk: 80+ GB
```

Enable OpenSSH in the Windows guest:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
New-NetFirewallRule -Name sshd -DisplayName "OpenSSH Server" `
  -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

Install the Windows toolchain in the guest:

- Git
- Node.js matching this repo's supported development version
- Corepack with `pnpm@11.9.0`
- Go 1.24 or newer
- Microsoft Edge
- Windows SDK, including `signtool.exe`, for Windows tray signing smoke

Then prepare package-manager state:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
git config --global core.autocrlf false
```

Configure the Windows target locally through `.remote-qa.env` or shell
environment. `REMOTE_QA_WINDOWS_SSH_KEY` is optional; when set, it must be a
path readable by the remote macOS QA account because the second SSH hop starts
from that Mac.

```sh
REMOTE_QA_WINDOWS_HOST="<guest-ip-or-bowfin-forward-host>"
REMOTE_QA_WINDOWS_USER="<windows-qa-user>"
REMOTE_QA_WINDOWS_PORT="22"
REMOTE_QA_WINDOWS_WORK_ROOT="C:/Users/<windows-qa-user>/work/ytm-enhancer"
REMOTE_QA_WINDOWS_SSH_KEY="$HOME/.ssh/<windows-guest-key-on-remote-mac>"
```

`REMOTE_QA_WINDOWS_WORK_ROOT` is deleted and recreated on every run. Point it at
a disposable repository checkout directory, not a broad parent directory.

Run the Windows SSH preflight before a full Windows QA sync:

```sh
scripts/remote/windows-qa/probe.sh
```

The probe verifies that the remote Mac can reach the UTM forwarded port and that
the Windows guest returns an OpenSSH banner before PowerShell runs. It does not
copy the repository into Windows.

Run a minimal Windows smoke:

```sh
scripts/remote/windows-qa/crabbox-run.sh -- powershell.exe -NoProfile \
  -Command '$PSVersionTable.PSVersion.ToString()'
```

If `nc` can connect to the forwarded port from the remote Mac, but SSH fails
before authentication with `Connection timed out during banner exchange` or
`kex_exchange_identification`, the repo wrapper has reached UTM and the failure
is inside the Windows guest. From the Windows desktop, double-click
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

Run the same check through bowfin and the Windows guest:

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

Run the same smoke through bowfin and the Windows guest:

```sh
scripts/remote/windows-qa/e2e-edge-smoke.sh
```

This runs the Playwright `edge` project against the system Microsoft Edge app in
the Windows guest. General Windows browser E2E remains scoped to Edge; the tray
connector button smoke covers Edge and Firefox.

Windows CLI native messaging QA is not wired yet. The current CLI native-host
install scripts and connector e2e smoke target macOS/Linux paths. Windows CLI
support remains intentionally out of scope; the user-facing Windows Connected
App is the tray connector.

Run the Windows tray connector smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows-qa/tray-smoke.ps1
```

Run the same smoke through bowfin and the Windows guest:

```sh
scripts/remote/windows-qa/tray-smoke.sh
```

This requires a .NET SDK that can build .NET 10 projects plus the .NET 10
runtime in the Windows guest. The `Microsoft.DotNet.SDK.10` winget package
provides both. It runs the dependency-free tray tests, publishes the WinForms
tray executable and native host relay for the guest architecture, installs
user-level Edge, Chrome, and Firefox native messaging registry keys, validates
the Chromium and Firefox manifests, and removes the smoke install.

Run the Windows tray release package smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-package-smoke.ps1
```

Run the same smoke through bowfin and the Windows guest:

```sh
scripts/remote/windows-qa/tray-package-smoke.sh
```

This builds the release zip for the guest architecture, generates
`YTM-Tray-update.json`, extracts the package, installs from the prebuilt
executables, validates the package metadata and manifest, and removes the smoke
install.

Run the Windows tray release signing smoke:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-signing-smoke.ps1
```

Run the same smoke through bowfin and the Windows guest:

```sh
scripts/remote/windows-qa/tray-signing-smoke.sh
```

This creates a disposable self-signed code-signing certificate in the Windows QA
user stores, exports a temporary PFX, builds the release zip with signing
required, verifies the packaged tray executable and native host have
Authenticode signatures from the disposable signer, and removes the temporary
certificate. It validates the signing plumbing without installing production
signing secrets on the QA VM.

Run the Windows tray visual smoke from an active Windows desktop session:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-visual-smoke.ps1
```

Run the same smoke through bowfin and the Windows guest:

```sh
scripts/remote/windows-qa/tray-visual-smoke.sh
```

This requires the same .NET SDK as the tray smoke and a logged-in desktop for
the QA user. It installs the tray app to a temporary directory, launches it
through an interactive scheduled task, finds the tray icon through Windows UI
Automation, opens the tray popup, captures desktop/overflow/popup screenshots
under the Windows user's temp directory, verifies long metadata scrolls, and
removes the smoke install.

Regenerate the Windows tray release screenshot from the same active Windows
desktop session:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-release-screenshot.ps1
```

Run the same capture through bowfin and the Windows guest:

```sh
scripts/remote/windows-qa/tray-release-screenshot.sh
```

This runs the real Windows tray app against the Edge Connected Apps smoke,
captures the tray popup after playback has been routed through native messaging,
and copies the PNG back to
`apps/windows-tray/release/windows-tray-screenshot.png`.

Run the Windows tray button smoke from an active Windows desktop session:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  scripts/windows-qa/tray-button-smoke.ps1
```

Run the same smoke through bowfin and the Windows guest:

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
- `REMOTE_QA_WINDOWS_HOST`
- `REMOTE_QA_WINDOWS_USER`
- `REMOTE_QA_WINDOWS_PORT`
- `REMOTE_QA_WINDOWS_WORK_ROOT`
- `REMOTE_QA_WINDOWS_SSH_KEY`

Keep real values local. If the remote address changes, update `.remote-qa.env`
or your shell environment.
