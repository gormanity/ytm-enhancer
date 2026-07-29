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
        | select(.prerelease == false)
        | .tag_name as $tag
        | select($tag | test("^cli-v[0-9]+\\.[0-9]+\\.[0-9]+$"))
        | ($tag | sub("^cli-v"; "")) as $version_string
        | [
            "YTM-Enhancer-CLI-\($version_string)-macos-x64.zip",
            "YTM-Enhancer-CLI-\($version_string)-macos-arm64.zip",
            "YTM-Enhancer-CLI-\($version_string)-linux-x64.tar.gz",
            "YTM-Enhancer-CLI-\($version_string)-linux-arm64.tar.gz",
            "SHA256SUMS"
          ] as $required_assets
        | . as $release
        | select(
            all(
              $required_assets[];
              . as $required_name
              | any(
                  $release.assets[];
                  .name == $required_name and .size > 0
                )
            )
          )
        | {
            tag: $tag,
            version: (
              $version_string
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
  echo "YTM_CLI_RELEASE_AVAILABLE=false" >>"$GITHUB_ENV"
  echo "::notice::No complete published CLI release was found; keeping source-install guidance."
  exit 0
fi

version="${tag#cli-v}"
release="$(
  printf '%s\n' "$releases" |
    jq --compact-output --arg tag "$tag" '
      .[] | select(.tag_name == $tag)
    '
)"
for asset in \
  "YTM-Enhancer-CLI-${version}-macos-x64.zip" \
  "YTM-Enhancer-CLI-${version}-macos-arm64.zip" \
  "YTM-Enhancer-CLI-${version}-linux-x64.tar.gz" \
  "YTM-Enhancer-CLI-${version}-linux-arm64.tar.gz" \
  "SHA256SUMS"; do
  if ! printf '%s\n' "$release" |
    jq --exit-status --arg asset "$asset" \
      '.assets[] | select(.name == $asset)' >/dev/null; then
    echo "::error::Published CLI release ${tag} is missing ${asset}."
    exit 1
  fi
done

checksum_url="$(
  printf '%s\n' "$release" |
    jq --raw-output '
      .assets[]
      | select(.name == "SHA256SUMS")
      | .browser_download_url
    ' |
    head -n 1
)"
if [ -z "$checksum_url" ]; then
  echo "::error::Published CLI release ${tag} has no checksum download URL."
  exit 1
fi

{
  echo "YTM_CLI_VERSION=$version"
  echo "YTM_CLI_RELEASE_AVAILABLE=true"
  echo "YTM_CLI_CHECKSUM_URL=$checksum_url"
} >>"$GITHUB_ENV"
