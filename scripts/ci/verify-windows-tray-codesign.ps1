param(
  [Parameter(Mandatory = $true)]
  [string] $PayloadRoot
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PayloadRoot -PathType Container)) {
  throw "Windows tray package payload was not found: $PayloadRoot"
}

$FilesToVerify = @(
  Get-ChildItem `
    -LiteralPath $PayloadRoot `
    -Filter *.exe `
    -File `
    -Recurse |
    Sort-Object FullName
)

if ($FilesToVerify.Count -eq 0) {
  throw "Signed executable was not found under: $PayloadRoot"
}

foreach ($FileToVerify in $FilesToVerify) {
  $Signature = Get-AuthenticodeSignature -FilePath $FileToVerify.FullName
  if ($Signature.Status -ne "Valid" -or $null -eq $Signature.SignerCertificate) {
    throw "Signed file does not have a valid Authenticode signature: $($FileToVerify.FullName) ($($Signature.Status))"
  }

  Write-Output "Verified Authenticode signature for $($FileToVerify.FullName)."
}
