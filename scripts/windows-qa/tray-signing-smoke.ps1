$ErrorActionPreference = "Stop"

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Write-SmokeStep {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Message
  )

  Write-Output "[tray-signing-smoke] $Message"
}

function Remove-CertificateByThumbprint {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Thumbprint,
    [Parameter(Mandatory = $true)]
    [string] $StoreName
  )

  $Store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
    $StoreName,
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

function Assert-SignedFile {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $ExpectedThumbprint
  )

  $Signature = Get-AuthenticodeSignature -FilePath $Path
  if ($Signature.Status -eq "NotSigned" -or $null -eq $Signature.SignerCertificate) {
    throw "Expected an Authenticode signature for $Path; got $($Signature.Status): $($Signature.StatusMessage)"
  }

  if ($Signature.SignerCertificate.Thumbprint -ne $ExpectedThumbprint) {
    throw "Expected $Path to be signed by $ExpectedThumbprint; got $($Signature.SignerCertificate.Thumbprint)"
  }
}

function Test-SignToolAvailable {
  if (Get-Command signtool.exe -ErrorAction SilentlyContinue) {
    return $true
  }

  $KitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (-not (Test-Path -LiteralPath $KitsRoot)) {
    return $false
  }

  $SignTool = Get-ChildItem -LiteralPath $KitsRoot -Recurse -Filter signtool.exe |
    Where-Object { $_.FullName -match "\\(arm64|x64|x86)\\signtool\.exe$" } |
    Select-Object -First 1
  return $null -ne $SignTool
}

if (-not (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) {
  throw "New-SelfSignedCertificate is required for Windows tray signing smoke."
}
Write-SmokeStep "Checking for Windows SDK SignTool."
if (-not (Test-SignToolAvailable)) {
  throw "Windows SDK SignTool is required for Windows tray signing smoke. Install the Windows SDK and ensure signtool.exe is available."
}

$RepositoryRoot = (Get-Location).Path
$Metadata = Get-Content -LiteralPath "apps/windows-tray/release/metadata.json" -Raw |
  ConvertFrom-Json
$RuntimeIdentifier = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
  "win-arm64"
} else {
  "win-x64"
}
$SmokeRoot = Join-Path $env:TEMP "ytm-tray-signing-smoke"
$PackageRoot = Join-Path $SmokeRoot "packages"
$ExtractRoot = Join-Path $SmokeRoot "extract"
$PfxPath = Join-Path $SmokeRoot "ytm-tray-signing-smoke.pfx"
$CertificatePasswordText = [Guid]::NewGuid().ToString("N")
$CertificatePassword = ConvertTo-SecureString `
  -String $CertificatePasswordText `
  -AsPlainText `
  -Force
$Certificate = $null
$CertificateThumbprint = $null

if (Test-Path -LiteralPath $SmokeRoot) {
  Remove-Item -LiteralPath $SmokeRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PackageRoot, $ExtractRoot | Out-Null

try {
  Write-SmokeStep "Creating disposable code signing certificate."
  $Certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=YTM Tray Signing Smoke $([Guid]::NewGuid().ToString("N"))" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeyUsage DigitalSignature `
    -NotAfter (Get-Date).AddDays(7)
  $CertificateThumbprint = $Certificate.Thumbprint

  Write-SmokeStep "Exporting disposable certificate to PFX."
  Export-PfxCertificate `
    -Cert $Certificate `
    -FilePath $PfxPath `
    -Password $CertificatePassword | Out-Null

  $env:YTM_WINDOWS_TRAY_CODESIGN_REQUIRED = "1"
  $env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH = $PfxPath
  $env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PASSWORD = $CertificatePasswordText
  $env:YTM_WINDOWS_TRAY_CODESIGN_TIMESTAMP_URL = "none"
  $env:YTM_WINDOWS_TRAY_CODESIGN_VERIFY_MODE = "signature"

  Write-SmokeStep "Building signed $RuntimeIdentifier release package."
  Invoke-Native node `
    apps/windows-tray/scripts/package-release.mjs `
    "--runtime=$RuntimeIdentifier" `
    "--output=$PackageRoot"

  $ArchivePath = Join-Path $PackageRoot "YTM-Tray-$($Metadata.version)-$RuntimeIdentifier.zip"
  Write-SmokeStep "Extracting $ArchivePath."
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force

  Write-SmokeStep "Verifying executable signatures."
  Assert-SignedFile `
    -Path (Join-Path $ExtractRoot "YTMTray.exe") `
    -ExpectedThumbprint $CertificateThumbprint
  Assert-SignedFile `
    -Path (Join-Path $ExtractRoot "YTMTray.NativeHost.exe") `
    -ExpectedThumbprint $CertificateThumbprint
  Write-SmokeStep "Signing smoke passed."
} finally {
  Remove-Item Env:YTM_WINDOWS_TRAY_CODESIGN_REQUIRED -ErrorAction SilentlyContinue
  Remove-Item Env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:YTM_WINDOWS_TRAY_CODESIGN_TIMESTAMP_URL -ErrorAction SilentlyContinue
  Remove-Item Env:YTM_WINDOWS_TRAY_CODESIGN_VERIFY_MODE -ErrorAction SilentlyContinue

  if ($CertificateThumbprint) {
    Remove-CertificateByThumbprint `
      -Thumbprint $CertificateThumbprint `
      -StoreName "My"
  }

  if (Test-Path -LiteralPath $SmokeRoot) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force
  }

  Set-Location -LiteralPath $RepositoryRoot
}
