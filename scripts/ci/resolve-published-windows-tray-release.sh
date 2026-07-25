#!/bin/sh

set -eu

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

releases="$(
  gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100"
)"
tag="$(
  printf '%s\n' "$releases" |
    jq --raw-output '
      [
        .[]
        | select(.draft == false)
        | .tag_name as $tag
        | select(
            $tag
            | test("^windows-tray-v[0-9]+\\.[0-9]+\\.[0-9]+$")
          )
        | {
            tag: $tag,
            version: (
              $tag
              | sub("^windows-tray-v"; "")
              | split(".")
              | map(tonumber)
            )
          }
      ]
      | sort_by(.version[0], .version[1], .version[2])
      | last
      | .tag // empty
    '
)"

if [ -z "$tag" ]; then
  echo "::error::No published Windows tray release was found."
  exit 1
fi

version="${tag#windows-tray-v}"
old_ifs="$IFS"
IFS=.
set -- $version
IFS="$old_ifs"
major="$1"
minor="$2"
patch="$3"
build_number=$((major * 1000000 + minor * 1000 + patch))
installer_asset="YTM-Tray-${version}-Setup.exe"
release="$(
  printf '%s\n' "$releases" |
    jq --compact-output --arg tag "$tag" '
      .[] | select(.tag_name == $tag)
    '
)"
installer_url="$(
  printf '%s\n' "$release" |
    jq --raw-output \
      --arg installer_asset "$installer_asset" \
      '.assets[]
        | select(.name == $installer_asset)
        | .browser_download_url' |
    head -n 1
)"
installer_available=true

if [ -z "$installer_url" ]; then
  installer_url="$(
    printf '%s\n' "$release" |
      jq --raw-output '.html_url'
  )"
  installer_available=false
  echo "::notice::Combined Windows installer is not published for ${tag}; using the release page temporarily."
fi

{
  echo "YTM_WINDOWS_TRAY_VERSION=$version"
  echo "YTM_WINDOWS_TRAY_BUILD_NUMBER=$build_number"
  echo "YTM_WINDOWS_TRAY_INSTALLER_URL=$installer_url"
  echo "YTM_WINDOWS_TRAY_INSTALLER_AVAILABLE=$installer_available"
} >> "$GITHUB_ENV"
