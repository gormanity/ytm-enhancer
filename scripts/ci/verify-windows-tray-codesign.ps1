param(
  [Parameter(Mandatory = $true)]
  [string] $PayloadRoot
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PayloadRoot)) {
  throw "Windows tray package payload was not found: $PayloadRoot"
}

$FilesToVerify = @(
  Join-Path $PayloadRoot "YTMTray.exe"
  Join-Path $PayloadRoot "YTMTray.NativeHost.exe"
)

foreach ($FileToVerify in $FilesToVerify) {
  if (-not (Test-Path -LiteralPath $FileToVerify)) {
    throw "Signed file was not found: $FileToVerify"
  }

  $Signature = Get-AuthenticodeSignature -FilePath $FileToVerify
  if ($Signature.Status -ne "Valid" -or $null -eq $Signature.SignerCertificate) {
    throw "Signed file does not have a valid Authenticode signature: $FileToVerify ($($Signature.Status))"
  }

  Write-Output "Verified Authenticode signature for $FileToVerify."
}
