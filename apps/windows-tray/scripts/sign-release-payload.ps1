param(
  [Parameter(Mandatory = $true)]
  [string] $PayloadRoot,
  [Parameter(Mandatory = $true)]
  [string] $CertificatePath,
  [string] $TimestampUrl = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TimestampUrl)) {
  $TimestampUrl = if ([string]::IsNullOrWhiteSpace($env:YTM_WINDOWS_TRAY_CODESIGN_TIMESTAMP_URL)) {
    "http://timestamp.digicert.com"
  } else {
    $env:YTM_WINDOWS_TRAY_CODESIGN_TIMESTAMP_URL
  }
}
$ShouldSkipTimestamp = $TimestampUrl -in @("none", "off", "skip")

function Find-SignTool {
  function Test-SignToolCandidate {
    param(
      [Parameter(Mandatory = $true)]
      [string] $Path
    )

    try {
      & $Path sign /? *> $null
      return $LASTEXITCODE -eq 0
    } catch {
      return $false
    }
  }

  $PathCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($PathCommand -and (Test-SignToolCandidate -Path $PathCommand.Source)) {
    return $PathCommand.Source
  }

  $KitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (-not (Test-Path -LiteralPath $KitsRoot)) {
    throw "signtool.exe was not found. Install the Windows SDK before signing Windows tray releases."
  }

  $Candidates = Get-ChildItem -LiteralPath $KitsRoot -Recurse -Filter signtool.exe |
    Where-Object { $_.FullName -match "\\(arm64|x64|x86)\\signtool\.exe$" }
  $PreferredArchitectures = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
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

  throw "signtool.exe was found, but no runnable Windows SDK SignTool executable could be started."
}

function Invoke-SignTool {
  param(
    [Parameter(Mandatory = $true)]
    [string] $SignToolPath,
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  & $SignToolPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "signtool.exe exited with code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $PayloadRoot)) {
  throw "Payload root was not found: $PayloadRoot"
}

if (-not (Test-Path -LiteralPath $CertificatePath)) {
  throw "Signing certificate was not found: $CertificatePath"
}

$SignTool = Find-SignTool
$CertificatePassword = $env:YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PASSWORD
if ($null -eq $CertificatePassword) {
  $CertificatePassword = ""
}
$VerifyMode = $env:YTM_WINDOWS_TRAY_CODESIGN_VERIFY_MODE
if ([string]::IsNullOrWhiteSpace($VerifyMode)) {
  $VerifyMode = "trust"
}

$FilesToSign = @(
  Join-Path $PayloadRoot "YTMTray.exe"
  Join-Path $PayloadRoot "YTMTray.NativeHost.exe"
)

foreach ($FileToSign in $FilesToSign) {
  if (-not (Test-Path -LiteralPath $FileToSign)) {
    throw "File to sign was not found: $FileToSign"
  }

  $SignArguments = @(
    "sign",
    "/fd",
    "SHA256"
  )

  if (-not $ShouldSkipTimestamp) {
    $SignArguments += @(
      "/td",
      "SHA256",
      "/tr",
      $TimestampUrl
    )
  }

  $SignArguments += @(
    "/f",
    $CertificatePath
  )

  if (-not [string]::IsNullOrEmpty($CertificatePassword)) {
    $SignArguments += @(
      "/p",
      $CertificatePassword
    )
  }

  $SignArguments += @(
    "/d",
    "YTM Tray",
    $FileToSign
  )

  Invoke-SignTool -SignToolPath $SignTool -Arguments $SignArguments
  if ($VerifyMode -eq "signature") {
    $Signature = Get-AuthenticodeSignature -FilePath $FileToSign
    if ($Signature.Status -eq "NotSigned" -or $null -eq $Signature.SignerCertificate) {
      throw "Signed file has no Authenticode signer certificate: $FileToSign"
    }
  } else {
    Invoke-SignTool -SignToolPath $SignTool -Arguments @("verify", "/pa", "/all", $FileToSign)
  }
}
