#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../../.." && pwd)"
output_path="${1:-$repo_root/apps/windows-tray/release/windows-tray-screenshot.png}"
log_file="$(mktemp)"
encoded_file="$(mktemp)"
decoded_file="$(mktemp)"

cleanup() {
  rm -f "$log_file" "$encoded_file" "$decoded_file"
}
trap cleanup EXIT

if ! "$script_dir/crabbox-run.sh" --shell '
$OutputPath = Join-Path (Get-Location) "apps/windows-tray/release/windows-tray-screenshot.png"
& .\scripts\windows-qa\tray-release-screenshot.ps1 -OutputPath $OutputPath
Write-Output "YTME_SCREENSHOT_BASE64_BEGIN"
$EncodedScreenshot = [Convert]::ToBase64String([IO.File]::ReadAllBytes($OutputPath))
$ChunkSize = 4096
for ($Offset = 0; $Offset -lt $EncodedScreenshot.Length; $Offset += $ChunkSize) {
  $Length = [Math]::Min($ChunkSize, $EncodedScreenshot.Length - $Offset)
  Write-Output ("YTME_SCREENSHOT_BASE64_CHUNK " + $EncodedScreenshot.Substring($Offset, $Length))
}
Write-Output "YTME_SCREENSHOT_BASE64_END"
' >"$log_file" 2>&1; then
  cat "$log_file" >&2
  exit 1
fi

awk '
  /YTME_SCREENSHOT_BASE64_BEGIN/ {
    capture = 1
    block = ""
    next
  }
  /YTME_SCREENSHOT_BASE64_END/ {
    if (capture) {
      final = block
      capture = 0
    }
    next
  }
  capture && /^YTME_SCREENSHOT_BASE64_CHUNK / {
    sub(/^YTME_SCREENSHOT_BASE64_CHUNK /, "")
    block = block $0 "\n"
  }
  END { printf "%s", final }
' "$log_file" | LC_ALL=C tr -d '\r' >"$encoded_file"

if [ ! -s "$encoded_file" ]; then
  cat "$log_file" >&2
  echo "Windows tray screenshot output did not contain encoded PNG data." >&2
  exit 1
fi

if base64 --decode <"$encoded_file" >"$decoded_file" 2>/dev/null; then
  :
elif base64 -d -i "$encoded_file" -o "$decoded_file" 2>/dev/null; then
  :
elif base64 -D -i "$encoded_file" -o "$decoded_file" 2>/dev/null; then
  :
else
  cat "$log_file" >&2
  echo "Could not decode Windows tray screenshot output." >&2
  exit 1
fi

mkdir -p "$(dirname -- "$output_path")"
mv "$decoded_file" "$output_path"
node "$repo_root/apps/windows-tray/scripts/mask-release-screenshot.mjs" "$output_path"

awk '
  /YTME_SCREENSHOT_BASE64_BEGIN/ { suppress = 1; next }
  /YTME_SCREENSHOT_BASE64_END/ { suppress = 0; next }
  !suppress { print }
' "$log_file"
printf "Copied Windows tray release screenshot to %s\n" "$output_path"
printf "Masked Windows tray release screenshot corners\n"
