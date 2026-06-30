$ErrorActionPreference = "Stop"

if (-not (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) {
  Write-Error "New-SelfSignedCertificate is required to prepare beta Windows tray signing."
  exit 1
}

if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  Write-Error "RUNNER_TEMP is required to prepare the Windows tray signing certificate."
  exit 1
}

if ([string]::IsNullOrWhiteSpace($env:GITHUB_ENV)) {
  Write-Error "GITHUB_ENV is required to export the Windows tray signing certificate path."
  exit 1
}

$CertificatePath = Join-Path $env:RUNNER_TEMP "windows-tray-beta-codesign.pfx"
$CertificatePasswordText = [Guid]::NewGuid().ToString("N")
$CertificatePassword = ConvertTo-SecureString `
  -String $CertificatePasswordText `
  -AsPlainText `
  -Force
$Certificate = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=YTM Tray Beta Self-Signed" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature `
  -NotAfter (Get-Date).AddDays(30)

Export-PfxCertificate `
  -Cert $Certificate `
  -FilePath $CertificatePath `
  -Password $CertificatePassword | Out-Null

"YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH=$CertificatePath" |
  Out-File -FilePath $env:GITHUB_ENV -Append
"YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PASSWORD=$CertificatePasswordText" |
  Out-File -FilePath $env:GITHUB_ENV -Append
"YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_THUMBPRINT=$($Certificate.Thumbprint)" |
  Out-File -FilePath $env:GITHUB_ENV -Append
"YTM_WINDOWS_TRAY_CODESIGN_TIMESTAMP_URL=none" |
  Out-File -FilePath $env:GITHUB_ENV -Append
"YTM_WINDOWS_TRAY_CODESIGN_VERIFY_MODE=signature" |
  Out-File -FilePath $env:GITHUB_ENV -Append

Write-Output "Prepared beta self-signed Windows tray certificate $($Certificate.Thumbprint)."
