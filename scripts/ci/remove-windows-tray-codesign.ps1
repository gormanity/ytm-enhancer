$ErrorActionPreference = "Stop"

function Remove-CertificateByThumbprint {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Thumbprint
  )

  $Store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
    "My",
    [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
  )
  try {
    $Store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $Certificates = $Store.Certificates.Find(
      [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
      $Thumbprint,
      $false
    )
    foreach ($Certificate in $Certificates) {
      $Store.Remove($Certificate)
    }
  } finally {
    $Store.Dispose()
  }
}

if (
  -not [string]::IsNullOrWhiteSpace($env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH) -and
  (Test-Path -LiteralPath $env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH)
) {
  Remove-Item `
    -LiteralPath $env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH `
    -Force
}

if (-not [string]::IsNullOrWhiteSpace($env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_THUMBPRINT)) {
  Remove-CertificateByThumbprint `
    -Thumbprint $env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_THUMBPRINT
}
