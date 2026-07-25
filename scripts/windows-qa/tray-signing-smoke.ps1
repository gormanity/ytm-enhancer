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

function Test-SignToolCandidate {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $Path sign /? *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}

function Find-SignTool {
  $PathCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($PathCommand -and (Test-SignToolCandidate -Path $PathCommand.Source)) {
    return $PathCommand.Source
  }

  $KitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (-not (Test-Path -LiteralPath $KitsRoot)) {
    throw "Windows SDK SignTool was not found."
  }

  $Candidates = Get-ChildItem `
    -LiteralPath $KitsRoot `
    -Recurse `
    -Filter signtool.exe |
    Where-Object { $_.FullName -match "\\(arm64|x64|x86)\\signtool\.exe$" }
  $PreferredArchitectures = if (
    $env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or
    $env:PROCESSOR_ARCHITEW6432 -eq "ARM64"
  ) {
    @("arm64", "x64", "x86")
  } else {
    @("x64", "x86", "arm64")
  }

  foreach ($Architecture in $PreferredArchitectures) {
    $ArchitectureCandidates = $Candidates |
      Where-Object { $_.FullName -match "\\$Architecture\\signtool\.exe$" } |
      Sort-Object FullName -Descending
    foreach ($Candidate in $ArchitectureCandidates) {
      if (Test-SignToolCandidate -Path $Candidate.FullName) {
        return $Candidate.FullName
      }
    }
  }

  throw "Windows SDK SignTool was found, but no runnable executable could be started."
}

function Test-SignToolAvailable {
  try {
    [void] (Find-SignTool)
    return $true
  } catch {
    return $false
  }
}

if (-not (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) {
  throw "New-SelfSignedCertificate is required for Windows tray signing smoke."
}
Write-SmokeStep "Checking for Windows SDK SignTool."
if (-not (Test-SignToolAvailable)) {
  throw "Windows SDK SignTool is required for Windows tray signing smoke."
}

$RepositoryRoot = (Get-Location).Path
$Metadata = Get-Content -LiteralPath "apps/windows-tray/release/metadata.json" -Raw |
  ConvertFrom-Json
$RuntimeIdentifiers = @("win-x64", "win-arm64")
$SmokeRoot = Join-Path $env:TEMP "ytm-tray-signing-smoke"
$PackageRoot = Join-Path $SmokeRoot "packages"
$ExtractRoot = Join-Path $SmokeRoot "extract"
$InstallerRoot = Join-Path $SmokeRoot "installer"
$CombinedInstallerPath =
  Join-Path $InstallerRoot "YTM-Tray-$($Metadata.version)-Setup.exe"
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
New-Item `
  -ItemType Directory `
  -Force `
  -Path $PackageRoot, $ExtractRoot, $InstallerRoot | Out-Null

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

  foreach ($RuntimeIdentifier in $RuntimeIdentifiers) {
    Write-SmokeStep "Building signed $RuntimeIdentifier release package."
    Invoke-Native node `
      apps/windows-tray/scripts/package-release.mjs `
      "--runtime=$RuntimeIdentifier" `
      "--output=$PackageRoot"

    $ArchivePath =
      Join-Path $PackageRoot "YTM-Tray-$($Metadata.version)-$RuntimeIdentifier.zip"
    $RuntimeExtractRoot = Join-Path $ExtractRoot $RuntimeIdentifier
    Write-SmokeStep "Extracting $ArchivePath."
    Expand-Archive `
      -LiteralPath $ArchivePath `
      -DestinationPath $RuntimeExtractRoot `
      -Force

    Write-SmokeStep "Verifying $RuntimeIdentifier executable signatures."
    Assert-SignedFile `
      -Path (Join-Path $RuntimeExtractRoot "YTMTray.exe") `
      -ExpectedThumbprint $CertificateThumbprint
    Assert-SignedFile `
      -Path (Join-Path $RuntimeExtractRoot "YTMTray.NativeHost.exe") `
      -ExpectedThumbprint $CertificateThumbprint
    Assert-SignedFile `
      -Path (Join-Path $RuntimeExtractRoot "YTMTray.Setup.exe") `
      -ExpectedThumbprint $CertificateThumbprint
  }

  Write-SmokeStep "Building the combined offline installer."
  . "$PSScriptRoot\ensure-pnpm.ps1"
  Ensure-Pnpm
  Invoke-Pnpm run windows-tray:installer -- `
    "--package-root=$PackageRoot" `
    "--output=$InstallerRoot"

  Write-SmokeStep "Verifying the combined offline installer signature."
  Assert-SignedFile `
    -Path $CombinedInstallerPath `
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
