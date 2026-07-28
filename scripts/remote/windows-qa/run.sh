#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
config_file="${REMOTE_QA_CONFIG:-$repo_root/.remote-qa.env}"
macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"

if [ -f "$config_file" ]; then
  # shellcheck disable=SC1090
  . "$config_file"
fi

transport="${REMOTE_QA_WINDOWS_TRANSPORT:-direct}"
windows_host="${REMOTE_QA_WINDOWS_HOST:-}"
windows_user="${REMOTE_QA_WINDOWS_USER:-}"
windows_port="${REMOTE_QA_WINDOWS_PORT:-22}"
windows_work_root="${REMOTE_QA_WINDOWS_WORK_ROOT:-}"
windows_ssh_key="${REMOTE_QA_WINDOWS_SSH_KEY:-}"
windows_pnpm_node_linker="${REMOTE_QA_WINDOWS_PNPM_NODE_LINKER:-}"
windows_pnpm_package_import_method="${REMOTE_QA_WINDOWS_PNPM_PACKAGE_IMPORT_METHOD:-}"
ssh_diagnostics_file=""
ssh_stderr_file=""
sync_manifest_source_file=""
sync_manifest_file=""
sync_operation_file=""
sync_revision_file=""
sync_archive_file=""
sync_script_file=""
run_script_file=""
sftp_batch_file=""
remote_stdout_file=""
remote_cleanup_armed="false"
remote_cleanup_command=""
cleanup_in_progress="false"

cleanup_ssh_diagnostics() {
  if [ -n "$ssh_diagnostics_file" ]; then
    rm -f "$ssh_diagnostics_file" 2>/dev/null || :
    ssh_diagnostics_file=""
  fi

  if [ -n "$ssh_stderr_file" ]; then
    rm -f "$ssh_stderr_file" 2>/dev/null || :
    ssh_stderr_file=""
  fi
}

cleanup_private_files() {
  cleanup_ssh_diagnostics

  if [ -n "$sync_manifest_file" ]; then
    rm -f "$sync_manifest_file" 2>/dev/null || :
    sync_manifest_file=""
  fi

  if [ -n "$sync_manifest_source_file" ]; then
    rm -f "$sync_manifest_source_file" 2>/dev/null || :
    sync_manifest_source_file=""
  fi

  if [ -n "$sync_revision_file" ]; then
    rm -f "$sync_revision_file" 2>/dev/null || :
    sync_revision_file=""
  fi

  if [ -n "$sync_operation_file" ]; then
    rm -f "$sync_operation_file" 2>/dev/null || :
    sync_operation_file=""
  fi

  if [ -n "$sync_archive_file" ]; then
    rm -f "$sync_archive_file" 2>/dev/null || :
    sync_archive_file=""
  fi

  if [ -n "$sync_script_file" ]; then
    rm -f "$sync_script_file" 2>/dev/null || :
    sync_script_file=""
  fi

  if [ -n "$run_script_file" ]; then
    rm -f "$run_script_file" 2>/dev/null || :
    run_script_file=""
  fi

  if [ -n "$sftp_batch_file" ]; then
    rm -f "$sftp_batch_file" 2>/dev/null || :
    sftp_batch_file=""
  fi

  if [ -n "$remote_stdout_file" ]; then
    rm -f "$remote_stdout_file" 2>/dev/null || :
    remote_stdout_file=""
  fi
}

cleanup_remote_transport() {
  if [ "$remote_cleanup_armed" != "true" ]; then
    return
  fi

  remote_cleanup_armed="false"
  if command -v ssh_windows >/dev/null 2>&1; then
    ssh_windows \
      powershell.exe \
      -NoProfile \
      -NonInteractive \
      -ExecutionPolicy Bypass \
      -EncodedCommand "$remote_cleanup_command" \
      >/dev/null 2>&1 || :
  fi
  remote_cleanup_command=""
}

cleanup_all() {
  if [ "$cleanup_in_progress" = "true" ]; then
    return
  fi

  cleanup_in_progress="true"
  cleanup_private_files
  cleanup_remote_transport
}

trap cleanup_all 0
trap 'cleanup_all; exit 1' 1 2 15

ps_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/''/g")"
}

ps_encoded() {
  printf "%s" "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d "\n"
}

file_sha256() {
  node -e '
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const stream = createReadStream(process.argv[1]);
const hash = createHash("sha256");
stream.on("data", (chunk) => hash.update(chunk));
stream.on("end", () => process.stdout.write(hash.digest("hex")));
stream.on("error", () => process.exit(1));
' "$1"
}

file_length() {
  node -e '
const { statSync } = require("node:fs");
process.stdout.write(String(statSync(process.argv[1]).size));
' "$1"
}

assert_short_encoded_command() {
  if [ "${#1}" -gt 6500 ]; then
    echo "Windows QA refused an oversized remote bootstrap command." >&2
    return 1
  fi
}

assert_sftp_batch_path() {
  if ! node -e '
const path = process.argv[1];
if (!/^[A-Za-z0-9_./-]+$/.test(path)) {
  process.exit(1);
}
' "$1"; then
    echo "Windows QA refused an unsafe local SFTP path." >&2
    return 1
  fi
}

ssh_with_private_diagnostics() {
  if ! ssh_diagnostics_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-ssh.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private SSH diagnostics file." >&2
    return 1
  fi
  if ! ssh_stderr_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-stderr.XXXXXX" 2>/dev/null
  )"; then
    cleanup_ssh_diagnostics
    echo "Windows QA could not create a private remote diagnostics file." >&2
    return 1
  fi
  chmod 600 "$ssh_diagnostics_file" "$ssh_stderr_file"

  if ssh -E "$ssh_diagnostics_file" "$@" 2>"$ssh_stderr_file"; then
    cleanup_ssh_diagnostics
    return 0
  else
    ssh_status="$?"
  fi

  cleanup_ssh_diagnostics
  echo "Windows QA SSH command failed." >&2
  return "$ssh_status"
}

ssh_windows() {
  if [ -n "$windows_ssh_key" ]; then
    ssh_with_private_diagnostics \
      -o BatchMode=yes \
      -o PreferredAuthentications=publickey \
      -o PasswordAuthentication=no \
      -o KbdInteractiveAuthentication=no \
      -o ForwardAgent=no \
      -o ForwardX11=no \
      -o ClearAllForwardings=yes \
      -o PermitLocalCommand=no \
      -o StrictHostKeyChecking=yes \
      -o IdentitiesOnly=yes \
      -o ConnectTimeout=10 \
      -o ServerAliveInterval=2 \
      -o ServerAliveCountMax=2 \
      -p "$windows_port" -i "$windows_ssh_key" \
      "$windows_user@$windows_host" "$@"
    return
  fi

  ssh_with_private_diagnostics \
    -o BatchMode=yes \
    -o PreferredAuthentications=publickey \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o ForwardAgent=no \
    -o ForwardX11=no \
    -o ClearAllForwardings=yes \
    -o PermitLocalCommand=no \
    -o StrictHostKeyChecking=yes \
    -o IdentitiesOnly=yes \
    -o ConnectTimeout=10 \
    -o ServerAliveInterval=2 \
    -o ServerAliveCountMax=2 \
    -p "$windows_port" "$windows_user@$windows_host" "$@"
}

sftp_windows() {
  batch_file="$1"
  if ! ssh_diagnostics_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-sftp.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private SFTP diagnostics file." >&2
    return 1
  fi
  if ! ssh_stderr_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-sftp-stderr.XXXXXX" 2>/dev/null
  )"; then
    cleanup_ssh_diagnostics
    echo "Windows QA could not create a private SFTP diagnostics file." >&2
    return 1
  fi
  chmod 600 "$ssh_diagnostics_file" "$ssh_stderr_file"

  set -- \
    -oBatchMode=yes \
    -oPreferredAuthentications=publickey \
    -oPasswordAuthentication=no \
    -oKbdInteractiveAuthentication=no \
    -oForwardAgent=no \
    -oClearAllForwardings=yes \
    -oStrictHostKeyChecking=yes \
    -oIdentitiesOnly=yes \
    -oConnectTimeout=10 \
    -oServerAliveInterval=2 \
    -oServerAliveCountMax=2
  if [ -n "$windows_ssh_key" ]; then
    set -- "$@" -i "$windows_ssh_key"
  fi
  set -- "$@" -P "$windows_port" -b "$batch_file"

  if sftp \
    "$@" \
    "$windows_user@$windows_host" \
    >"$ssh_diagnostics_file" 2>"$ssh_stderr_file"; then
    cleanup_ssh_diagnostics
    return 0
  fi

  cleanup_ssh_diagnostics
  echo "Windows QA SFTP transfer failed." >&2
  return 1
}

usage() {
  echo "Usage: $0 [--preserve-apps] [--adopt-work-root] [--shell <powershell-script> | -- <command...>]" >&2
}

preserve_apps="false"
adopt_work_root="false"
while [ "$#" -gt 0 ]; do
  case "${1:-}" in
    --preserve-apps)
      preserve_apps="true"
      shift
      ;;
    --adopt-work-root)
      adopt_work_root="true"
      shift
      ;;
    *)
      break
      ;;
  esac
done

if [ "$adopt_work_root" = "true" ] && [ "$preserve_apps" != "true" ]; then
  echo "Adoption requires --preserve-apps." >&2
  exit 2
fi

if [ -z "$windows_host" ] || [ -z "$windows_user" ] || [ -z "$windows_work_root" ]; then
  echo "Windows QA target is not configured." >&2
  echo "Set REMOTE_QA_WINDOWS_HOST, REMOTE_QA_WINDOWS_USER, and REMOTE_QA_WINDOWS_WORK_ROOT." >&2
  echo "You can place them in ignored .remote-qa.env." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

if [ "${1:-}" = "--shell" ]; then
  if [ "$#" -ne 2 ]; then
    usage
    exit 2
  fi
  windows_script="$2"
else
  if [ "${1:-}" = "--" ]; then
    shift
  fi
  if [ "$#" -eq 0 ]; then
    usage
    exit 2
  fi

  command_line=""
  for arg in "$@"; do
    if [ -z "$command_line" ]; then
      command_line="$(ps_quote "$arg")"
    else
      command_line="$command_line $(ps_quote "$arg")"
    fi
  done

  windows_script="& $command_line
if (\$LASTEXITCODE -is [int] -and \$LASTEXITCODE -ne 0) {
  exit \$LASTEXITCODE
}"
fi

run_direct() {
  if ! command -v ssh >/dev/null 2>&1 ||
    ! command -v sftp >/dev/null 2>&1; then
    echo "Windows QA requires ssh and sftp on this host." >&2
    exit 127
  fi

  if ! command -v jj >/dev/null 2>&1 ||
    ! command -v node >/dev/null 2>&1; then
    echo "Windows QA sync requires jj and Node.js on this host." >&2
    exit 127
  fi

  if ! command -v iconv >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
    echo "Windows QA requires iconv and base64 on this host." >&2
    exit 127
  fi

  if [ -n "$windows_ssh_key" ] && [ ! -r "$windows_ssh_key" ]; then
    echo "Windows QA SSH key not found or not readable." >&2
    exit 1
  fi

  if ! cd "$repo_root" 2>/dev/null; then
    echo "Windows QA could not enter the repository root." >&2
    exit 1
  fi

  target_literal="$(ps_quote "$windows_work_root")"
  preserve_apps_literal='$false'
  if [ "$preserve_apps" = "true" ]; then
    preserve_apps_literal='$true'
  fi
  adopt_work_root_literal='$false'
  if [ "$adopt_work_root" = "true" ]; then
    adopt_work_root_literal='$true'
  fi

  sync_helper_file="$repo_root/scripts/windows-qa/sync-source.ps1"
  if [ ! -r "$sync_helper_file" ]; then
    echo "Windows QA sync helper is missing or not readable." >&2
    exit 1
  fi
  sync_manifest_validator="$repo_root/scripts/validate-remote-qa-manifest.mjs"
  if [ ! -r "$sync_manifest_validator" ]; then
    echo "Windows QA manifest validator is missing or not readable." >&2
    exit 1
  fi
  sync_archive_validator="$repo_root/scripts/validate-remote-qa-archive.sh"
  if [ ! -x "$sync_archive_validator" ]; then
    echo "Windows QA archive validator is missing or not executable." >&2
    exit 1
  fi
  sync_archive_creator="$repo_root/scripts/create-remote-qa-archive.mjs"
  if [ ! -r "$sync_archive_creator" ]; then
    echo "Windows QA archive creator is missing or not readable." >&2
    exit 1
  fi
  private_output_redactor="$repo_root/scripts/remote/redact-private-output.mjs"
  if [ ! -r "$private_output_redactor" ]; then
    echo "Windows QA output redactor is missing or not readable." >&2
    exit 1
  fi

  # Only files tracked by the current Jujutsu working-copy revision are synchronized.
  # Ignored files, including `.remote-qa.env` and build artifacts, are never archived.
  if ! sync_operation_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-operation.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private operation snapshot." >&2
    exit 1
  fi
  assert_sftp_batch_path "$sync_operation_file"
  if ! sync_revision_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-revision.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private revision snapshot." >&2
    exit 1
  fi
  if ! sync_manifest_source_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-manifest-source.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private source manifest." >&2
    exit 1
  fi
  if ! sync_manifest_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-manifest.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private sync manifest." >&2
    exit 1
  fi
  chmod 600 \
    "$sync_operation_file" \
    "$sync_revision_file" \
    "$sync_manifest_source_file" \
    "$sync_manifest_file"
  if ! jj --color=never --quiet log -r @ --no-graph -T '' \
    >/dev/null 2>&1; then
    echo "Windows QA could not snapshot the working copy." >&2
    exit 1
  fi
  if ! jj --at-operation=@ --ignore-working-copy --color=never --quiet \
    op log --no-graph -n 1 -T 'id ++ "\0"' \
    >"$sync_operation_file" 2>/dev/null; then
    echo "Windows QA could not pin the repository operation." >&2
    exit 1
  fi
  if ! sync_operation="$(
    node -e '
const { readFileSync } = require("node:fs");
const value = readFileSync(process.argv[1]);
const text = value.toString("utf8");
if (
  value.length !== Buffer.byteLength(text) ||
  !/^[0-9a-f]{64,128}\0$/.test(text)
) {
  process.exit(1);
}
process.stdout.write(text.slice(0, -1));
' "$sync_operation_file"
  )"; then
    echo "Windows QA received an invalid repository operation." >&2
    exit 1
  fi
  if ! jj --at-operation="$sync_operation" --color=never --quiet \
    log --no-graph -r @ -T 'commit_id ++ "\0"' \
    >"$sync_revision_file" 2>/dev/null; then
    echo "Windows QA could not snapshot the working-copy revision." >&2
    exit 1
  fi
  if ! sync_revision="$(
    node -e '
const { readFileSync } = require("node:fs");
const value = readFileSync(process.argv[1]);
const text = value.toString("utf8");
if (
  value.length !== Buffer.byteLength(text) ||
  !/^[0-9a-f]{40,64}\0$/.test(text)
) {
  process.exit(1);
}
process.stdout.write(text.slice(0, -1));
' "$sync_revision_file"
  )"; then
    echo "Windows QA received an invalid working-copy revision." >&2
    exit 1
  fi
  if ! jj --at-operation="$sync_operation" --color=never --quiet \
    file list -r "$sync_revision" -T 'path ++ "\0"' \
    >"$sync_manifest_source_file" 2>/dev/null; then
    echo "Windows QA could not list pinned tracked files." >&2
    exit 1
  fi
  if ! node "$sync_manifest_validator" <"$sync_manifest_source_file" \
    >"$sync_manifest_file"; then
    echo "Windows QA refused a privacy-unsafe tracked-file manifest." >&2
    exit 1
  fi
  if [ ! -s "$sync_manifest_file" ]; then
    echo "Windows QA refused to synchronize an empty safe-file manifest." >&2
    exit 1
  fi
  if ! sync_archive_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-source.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private source archive." >&2
    exit 1
  fi
  chmod 600 "$sync_archive_file"

  if ! node "$sync_archive_creator" "$sync_archive_file" "$sync_operation" "$sync_revision" \
    <"$sync_manifest_file"; then
    echo "Windows QA could not create the tracked source archive." >&2
    exit 1
  fi
  if ! "$sync_archive_validator" "$sync_archive_file"; then
    echo "Windows QA refused a non-regular source archive." >&2
    exit 1
  fi

  sync_manifest_base64="$(base64 <"$sync_manifest_file" | tr -d "\n")"
  sync_archive_sha256="$(file_sha256 "$sync_archive_file")"
  sync_archive_length="$(file_length "$sync_archive_file")"
  sync_transport_id="$(
    node -e '
const { randomBytes } = require("node:crypto");
process.stdout.write(randomBytes(16).toString("hex"));
'
  )"
  if ! sync_script_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-helper.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private sync helper." >&2
    exit 1
  fi
  chmod 600 "$sync_script_file"
  {
    printf '$target = %s\n' "$target_literal"
    printf '$PreserveApps = %s\n' "$preserve_apps_literal"
    printf '$AdoptWorkRoot = %s\n' "$adopt_work_root_literal"
    printf '$ExpectedArchiveLength = %s\n' "$sync_archive_length"
    printf '$ExpectedArchiveSha256 = %s\n' \
      "$(ps_quote "$sync_archive_sha256")"
    printf '$ManifestBase64 = %s\n' \
      "$(ps_quote "$sync_manifest_base64")"
    sed -n '1,$p' "$sync_helper_file"
  } >"$sync_script_file"
  sync_script_sha256="$(file_sha256 "$sync_script_file")"
  sync_script_length="$(file_length "$sync_script_file")"

  pnpm_env_script=""
  if [ -n "$windows_pnpm_node_linker" ]; then
    pnpm_env_script="$pnpm_env_script
\$env:PNPM_CONFIG_NODE_LINKER = $(ps_quote "$windows_pnpm_node_linker")"
  fi
  if [ -n "$windows_pnpm_package_import_method" ]; then
    pnpm_env_script="$pnpm_env_script
\$env:PNPM_CONFIG_PACKAGE_IMPORT_METHOD = $(ps_quote "$windows_pnpm_package_import_method")"
  fi
  run_script="
\$ErrorActionPreference = 'Stop'
\$ProgressPreference = 'SilentlyContinue'
$pnpm_env_script
Set-Location -LiteralPath $target_literal
$windows_script
if (\$LASTEXITCODE -is [int] -and \$LASTEXITCODE -ne 0) {
  exit \$LASTEXITCODE
}
"
  if ! run_script_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-command.XXXXXX" 2>/dev/null
  )"; then
    echo "Windows QA could not create a private remote command file." >&2
    exit 1
  fi
  chmod 600 "$run_script_file"
  printf "%s\n" "$run_script" >"$run_script_file"
  run_script_sha256="$(file_sha256 "$run_script_file")"
  run_script_length="$(file_length "$run_script_file")"

  transport_id_literal="$(ps_quote "$sync_transport_id")"
  script_sha256_literal="$(ps_quote "$sync_script_sha256")"
  archive_sha256_literal="$(ps_quote "$sync_archive_sha256")"
  run_sha256_literal="$(ps_quote "$run_script_sha256")"
  transport_cleanup_function='function Remove-ExactTransportFiles {
  param($Root,$Names)
  $reparse = [IO.FileAttributes]::ReparsePoint
  foreach ($name in $Names) {
    $r = Get-Item -LiteralPath $Root -Force -EA SilentlyContinue
    if ($null -eq $r) { return }
    if (-not $r.PSIsContainer -or ($r.Attributes -band $reparse) -ne 0) {
      throw "Unsafe root."
    }
    $p = Join-Path $r.FullName $name
    $i = Get-Item -LiteralPath $p -Force -EA SilentlyContinue
    if ($null -eq $i) { continue }
    if ($i.PSIsContainer -or ($i.Attributes -band $reparse) -ne 0) {
      throw "Unsafe entry."
    }
    [IO.File]::Delete($i.FullName)
  }
}'
  setup_script="
\$ErrorActionPreference = 'Stop'
\$root = Join-Path \$HOME '.ytm-enhancer-remote-qa'
\$id = $transport_id_literal
New-Item -ItemType Directory -Force -Path \$root | Out-Null
\$rootItem = Get-Item -LiteralPath \$root -Force -ErrorAction Stop
if (-not \$rootItem.PSIsContainer -or (\$rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Unsafe root.'
}
\$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
\$acl = [Security.AccessControl.DirectorySecurity]::new()
\$acl.SetAccessRuleProtection(\$true, \$false)
\$inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
foreach (\$sid in @(
  \$identity.User,
  [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
  [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
)) {
  \$rule = [Security.AccessControl.FileSystemAccessRule]::new(
    \$sid,
    [Security.AccessControl.FileSystemRights]::FullControl,
    \$inheritance,
    [Security.AccessControl.PropagationFlags]::None,
    [Security.AccessControl.AccessControlType]::Allow
  )
  \$acl.AddAccessRule(\$rule)
}
\$acl.SetOwner(\$identity.User)
Set-Acl -LiteralPath \$root -AclObject \$acl -ErrorAction Stop
\$rootItem = Get-Item -LiteralPath \$root -Force -ErrorAction Stop
if (-not \$rootItem.PSIsContainer -or (\$rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Unsafe root.'
}
\$staleBefore = [DateTime]::UtcNow.AddHours(-1)
foreach (\$item in @(
    Get-ChildItem -LiteralPath \$root -Force -ErrorAction Stop
  )) {
  if (
    \$item.Name -notmatch (
      '^(?:helper-[0-9a-f]{32}\.ps1\.tmp|' +
      'archive-[0-9a-f]{32}\.tar\.gz\.tmp|' +
      'command-[0-9a-f]{32}\.ps1\.tmp)$'
    )
  ) {
    continue
  }
  if (\$item.PSIsContainer -or (\$item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Unsafe stale entry.'
  }
  if (\$item.LastWriteTimeUtc -lt \$staleBefore) {
    \$rootItem = Get-Item -LiteralPath \$root -Force -ErrorAction Stop
    if (-not \$rootItem.PSIsContainer -or (\$rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Unsafe root.'
    }
    [IO.File]::Delete(\$item.FullName)
  }
}
foreach (\$name in @(
  \"helper-\$id.ps1.tmp\",
  \"archive-\$id.tar.gz.tmp\",
  \"command-\$id.ps1.tmp\"
)) {
  if (Test-Path -LiteralPath (Join-Path \$root \$name)) {
    throw 'Path exists.'
  }
}
"
  execute_script="
\$ErrorActionPreference = 'Stop'
\$root = Join-Path \$HOME '.ytm-enhancer-remote-qa'
\$id = $transport_id_literal
$transport_cleanup_function
\$helperPath = Join-Path \$root (\"helper-\$id.ps1.tmp\")
\$archivePath = Join-Path \$root (\"archive-\$id.tar.gz.tmp\")
\$commandPath = Join-Path \$root (\"command-\$id.ps1.tmp\")
function Assert-TransportFile {
  param(\$Path, [long] \$ExpectedLength, \$ExpectedHash)
  \$item = Get-Item -LiteralPath \$Path -Force -EA Stop
  if (\$item.PSIsContainer -or (\$item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or \$item.Length -ne \$ExpectedLength) {
    throw 'Invalid file.'
  }
  \$actualHash = (Get-FileHash -LiteralPath \$Path -Algorithm SHA256).Hash
  if (-not [string]::Equals(\$actualHash, \$ExpectedHash, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Invalid file.'
  }
}
try {
  \$rootItem = Get-Item -LiteralPath \$root -Force -EA Stop
  if (-not \$rootItem.PSIsContainer -or (\$rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Unsafe root.'
  }
  Assert-TransportFile \$helperPath $sync_script_length $script_sha256_literal
  Assert-TransportFile \$archivePath $sync_archive_length $archive_sha256_literal
  Assert-TransportFile \$commandPath $run_script_length $run_sha256_literal
  \$utf8 = [Text.UTF8Encoding]::new(\$false, \$true)
  \$helperBytes = [IO.File]::ReadAllBytes(\$helperPath)
  \$ArchivePath = \$archivePath
  . ([scriptblock]::Create(\$utf8.GetString(\$helperBytes)))
  \$commandBytes = [IO.File]::ReadAllBytes(\$commandPath)
  . ([scriptblock]::Create(\$utf8.GetString(\$commandBytes)))
} finally {
  Remove-ExactTransportFiles -Root \$root -Names @(
    \"archive-\$id.tar.gz.tmp\",
    \"helper-\$id.ps1.tmp\",
    \"command-\$id.ps1.tmp\"
  )
}
"
  cleanup_script="
\$ErrorActionPreference = 'Stop'
\$root = Join-Path \$HOME '.ytm-enhancer-remote-qa'
\$id = $transport_id_literal
$transport_cleanup_function
\$rootItem = Get-Item -LiteralPath \$root -Force -ErrorAction SilentlyContinue
if (\$null -ne \$rootItem -and (
    -not \$rootItem.PSIsContainer -or
    (\$rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  )) {
  throw 'Unsafe root.'
}
Remove-ExactTransportFiles -Root \$root -Names @(
  \"helper-\$id.ps1.tmp\",
  \"archive-\$id.tar.gz.tmp\",
  \"command-\$id.ps1.tmp\"
)
"
  setup_command="$(ps_encoded "$setup_script")"
  execute_command="$(ps_encoded "$execute_script")"
  cleanup_command="$(ps_encoded "$cleanup_script")"
  if [ "${YTME_REMOTE_QA_SAFE_DEBUG:-}" = "1" ]; then
    echo "Windows QA transport: preparing transfer."
    echo "Setup bootstrap characters: ${#setup_command}"
    echo "Execute bootstrap characters: ${#execute_command}"
    echo "Cleanup bootstrap characters: ${#cleanup_command}"
  fi
  assert_short_encoded_command "$setup_command"
  assert_short_encoded_command "$execute_command"
  assert_short_encoded_command "$cleanup_command"
  assert_sftp_batch_path "$sync_script_file"
  assert_sftp_batch_path "$sync_archive_file"
  assert_sftp_batch_path "$run_script_file"
  remote_cleanup_command="$cleanup_command"

  if ! ssh_windows \
    powershell.exe \
    -NoProfile \
    -NonInteractive \
    -ExecutionPolicy Bypass \
    -EncodedCommand "$setup_command" \
    >/dev/null; then
    cleanup_private_files
    return 1
  fi
  remote_cleanup_armed="true"
  if [ "${YTME_REMOTE_QA_SAFE_DEBUG:-}" = "1" ]; then
    echo "Windows QA transport: transferring payload."
  fi
  if ! sftp_batch_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-sftp-batch.XXXXXX" 2>/dev/null
  )"; then
    cleanup_private_files
    cleanup_remote_transport
    echo "Windows QA could not create a private SFTP batch file." >&2
    return 1
  fi
  chmod 600 "$sftp_batch_file"
  {
    printf 'put "%s" ".ytm-enhancer-remote-qa/helper-%s.ps1.tmp"\n' \
      "$sync_script_file" "$sync_transport_id"
    printf 'put "%s" ".ytm-enhancer-remote-qa/archive-%s.tar.gz.tmp"\n' \
      "$sync_archive_file" "$sync_transport_id"
    printf 'put "%s" ".ytm-enhancer-remote-qa/command-%s.ps1.tmp"\n' \
      "$run_script_file" "$sync_transport_id"
  } >"$sftp_batch_file"
  if ! sftp_windows "$sftp_batch_file"; then
    cleanup_private_files
    cleanup_remote_transport
    return 1
  fi
  if ! remote_stdout_file="$(
    mktemp "${TMPDIR:-/tmp}/ytm-windows-qa-stdout.XXXXXX" 2>/dev/null
  )"; then
    cleanup_private_files
    cleanup_remote_transport
    echo "Windows QA could not create a private output file." >&2
    return 1
  fi
  chmod 600 "$remote_stdout_file"
  if ! ssh_windows \
    powershell.exe \
    -NoProfile \
    -NonInteractive \
    -ExecutionPolicy Bypass \
    -EncodedCommand "$execute_command" \
    >"$remote_stdout_file"; then
    cleanup_private_files
    cleanup_remote_transport
    return 1
  fi
  if ! YTME_REDACT_WINDOWS_REMOTE_HOST="$windows_host" \
    YTME_REDACT_WINDOWS_REMOTE_USER="$windows_user" \
    YTME_REDACT_WINDOWS_REMOTE_WORK_ROOT="$windows_work_root" \
    YTME_REDACT_WINDOWS_REMOTE_SSH_KEY="$windows_ssh_key" \
    node "$private_output_redactor" "$remote_stdout_file"; then
    cleanup_private_files
    cleanup_remote_transport
    echo "Windows QA could not safely replay remote output." >&2
    return 1
  fi
  remote_cleanup_armed="false"
  remote_cleanup_command=""
  if [ "${YTME_REMOTE_QA_SAFE_DEBUG:-}" = "1" ]; then
    echo "Windows QA transport: source synchronized."
  fi
  cleanup_private_files
}

run_macos_intermediary() {
  if [ ! -x "$macos_runner" ]; then
    echo "macOS QA runner is missing or not executable." >&2
    exit 1
  fi

  remote_command='
set -eu

set -- --shell "$REMOTE_QA_WINDOWS_REMOTE_SCRIPT"
if [ "${REMOTE_QA_WINDOWS_PRESERVE_APPS:-false}" = "true" ]; then
  set -- --preserve-apps "$@"
fi
if [ "${REMOTE_QA_WINDOWS_ADOPT_WORK_ROOT:-false}" = "true" ]; then
  set -- --adopt-work-root "$@"
fi

REMOTE_QA_CONFIG=/dev/null \
REMOTE_QA_WINDOWS_TRANSPORT=direct \
scripts/remote/windows-qa/run.sh "$@"
'

  REMOTE_QA_WINDOWS_HOST="$windows_host" \
    REMOTE_QA_WINDOWS_USER="$windows_user" \
    REMOTE_QA_WINDOWS_PORT="$windows_port" \
    REMOTE_QA_WINDOWS_WORK_ROOT="$windows_work_root" \
    REMOTE_QA_WINDOWS_SSH_KEY="$windows_ssh_key" \
    REMOTE_QA_WINDOWS_PNPM_NODE_LINKER="$windows_pnpm_node_linker" \
    REMOTE_QA_WINDOWS_PNPM_PACKAGE_IMPORT_METHOD="$windows_pnpm_package_import_method" \
    REMOTE_QA_WINDOWS_REMOTE_SCRIPT="$windows_script" \
    REMOTE_QA_WINDOWS_PRESERVE_APPS="$preserve_apps" \
    REMOTE_QA_WINDOWS_ADOPT_WORK_ROOT="$adopt_work_root" \
    "$macos_runner" \
      --allow-env REMOTE_QA_WINDOWS_HOST \
      --allow-env REMOTE_QA_WINDOWS_USER \
      --allow-env REMOTE_QA_WINDOWS_PORT \
      --allow-env REMOTE_QA_WINDOWS_WORK_ROOT \
      --allow-env REMOTE_QA_WINDOWS_SSH_KEY \
      --allow-env REMOTE_QA_WINDOWS_PNPM_NODE_LINKER \
      --allow-env REMOTE_QA_WINDOWS_PNPM_PACKAGE_IMPORT_METHOD \
      --allow-env REMOTE_QA_WINDOWS_REMOTE_SCRIPT \
      --allow-env REMOTE_QA_WINDOWS_PRESERVE_APPS \
      --allow-env REMOTE_QA_WINDOWS_ADOPT_WORK_ROOT \
      --shell "$remote_command"
}

case "$transport" in
  direct)
    run_direct
    ;;
  macos | crabbox)
    run_macos_intermediary
    ;;
  *)
    echo "Unsupported Windows QA transport." >&2
    echo "Use direct or macos." >&2
    exit 2
    ;;
esac
