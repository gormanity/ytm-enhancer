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
installs `ytme` as a Linux native messaging host into a throwaway XDG config
directory, loads the dev extension in Chromium, enables Connected Apps through
the popup, and verifies `ytme play`, `ytme pause`, `ytme next`, and
`ytme previous` route through the extension into a YouTube Music fixture.

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

The menu bar smoke uses a non-secret throwaway Sparkle public key so the remote
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
- `REMOTE_QA_LINUX_X64_PROVIDER`
- `REMOTE_QA_LINUX_X64_ARCH`
- `REMOTE_QA_LINUX_X64_IMAGE`
- `REMOTE_QA_LINUX_X64_TTL`
- `REMOTE_QA_LINUX_X64_IDLE_TIMEOUT`
- `REMOTE_QA_LINUX_X64_ALLOW_EMULATED_BROWSER_E2E`
- `REMOTE_QA_LINUX_X64_E2E_PLATFORM`
- `REMOTE_QA_LINUX_X64_E2E_IMAGE`

Keep real values local. If the remote address changes, update `.remote-qa.env`
or your shell environment.
