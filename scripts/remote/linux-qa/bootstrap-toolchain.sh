#!/usr/bin/env sh
set -eu

tool_root="${REMOTE_QA_LINUX_TOOL_ROOT:-$HOME/.local/ytm-enhancer-linux-qa}"

node_version="${REMOTE_QA_LINUX_NODE_VERSION:-24.11.1}"
go_version="${REMOTE_QA_LINUX_GO_VERSION:-1.26.4}"
pnpm_version="${REMOTE_QA_LINUX_PNPM_VERSION:-11.9.0}"

linux_arch() {
  case "$(uname -m)" in
    aarch64 | arm64)
      printf "arm64"
      ;;
    x86_64 | amd64)
      printf "x64"
      ;;
    *)
      echo "Unsupported Linux architecture: $(uname -m)" >&2
      return 1
      ;;
  esac
}

go_arch() {
  case "$(uname -m)" in
    aarch64 | arm64)
      printf "arm64"
      ;;
    x86_64 | amd64)
      printf "amd64"
      ;;
    *)
      echo "Unsupported Linux architecture: $(uname -m)" >&2
      return 1
      ;;
  esac
}

run_privileged() {
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi
  "$@"
}

ensure_download_tools() {
  require_xz="${1:-0}"

  if command -v curl >/dev/null 2>&1 &&
    command -v tar >/dev/null 2>&1 &&
    command -v gzip >/dev/null 2>&1 &&
    { [ "$require_xz" != "1" ] || command -v xz >/dev/null 2>&1; }; then
    return 0
  fi

  run_privileged apt-get update
  packages="ca-certificates curl gzip tar"
  if [ "$require_xz" = "1" ]; then
    packages="$packages xz-utils"
  fi
  # shellcheck disable=SC2086
  run_privileged apt-get install -y $packages
}

install_node() {
  arch="$(linux_arch)"
  name="node-v$node_version-linux-$arch"
  install_dir="$tool_root/$name"
  archive="$tool_root/downloads/$name.tar.xz"

  ensure_download_tools 1
  mkdir -p "$tool_root/downloads"

  if [ ! -x "$install_dir/bin/node" ]; then
    curl -fsSL "https://nodejs.org/dist/v$node_version/$name.tar.xz" \
      -o "$archive"
    rm -rf "$install_dir"
    tar -xJf "$archive" -C "$tool_root"
  fi

  export PATH="$install_dir/bin:$PATH"
  export COREPACK_HOME="${COREPACK_HOME:-$tool_root/corepack}"

  corepack enable
  corepack prepare "pnpm@$pnpm_version" --activate
}

install_go() {
  arch="$(go_arch)"
  name="go$go_version.linux-$arch"
  install_dir="$tool_root/$name"
  archive="$tool_root/downloads/$name.tar.gz"

  ensure_download_tools
  mkdir -p "$tool_root/downloads"

  if [ ! -x "$install_dir/go/bin/go" ]; then
    curl -fsSL "https://go.dev/dl/$name.tar.gz" -o "$archive"
    rm -rf "$install_dir"
    mkdir -p "$install_dir"
    tar -xzf "$archive" -C "$install_dir"
  fi

  export PATH="$install_dir/go/bin:$PATH"
  export GOCACHE="${GOCACHE:-$tool_root/go-cache}"
  export GOMODCACHE="${GOMODCACHE:-$tool_root/go-mod-cache}"
}

if [ "$#" -eq 0 ]; then
  set -- node
fi

for tool in "$@"; do
  case "$tool" in
    node)
      install_node
      ;;
    go)
      install_go
      ;;
    *)
      echo "Unknown Linux QA toolchain: $tool" >&2
      return 2 2>/dev/null || exit 2
      ;;
  esac
done

return 0 2>/dev/null || {
  command -v node >/dev/null 2>&1 && node --version
  command -v pnpm >/dev/null 2>&1 && pnpm --version
  command -v go >/dev/null 2>&1 && go version
}
