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

function Find-SignTool {
  $PathCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($PathCommand) {
    return $PathCommand.Source
  }

  $KitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (-not (Test-Path -LiteralPath $KitsRoot)) {
    throw "signtool.exe was not found. Install the Windows SDK before signing Windows tray releases."
  }

  $Candidate = Get-ChildItem -LiteralPath $KitsRoot -Recurse -Filter signtool.exe |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $Candidate) {
    throw "signtool.exe was not found. Install the Windows SDK before signing Windows tray releases."
  }

  return $Candidate.FullName
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
    "SHA256",
    "/td",
    "SHA256",
    "/tr",
    $TimestampUrl,
    "/f",
    $CertificatePath,
    "/p",
    $CertificatePassword,
    "/d",
    "YTM Tray",
    $FileToSign
  )

  Invoke-SignTool -SignToolPath $SignTool -Arguments $SignArguments
  Invoke-SignTool -SignToolPath $SignTool -Arguments @("verify", "/pa", "/all", $FileToSign)
}
