# Setup CasADi C++ binaries for Windows
$ErrorActionPreference = "Stop"

$casadiUrl = "https://github.com/casadi/casadi/releases/download/3.6.5/casadi-3.6.5-windows64-matlab2018b.zip"
$targetZip = "casadi.zip"
$thirdPartyDir = "m:\2026-5-18gnc-2\2026-5-18gnc-2\project_GNC-V6.0\gnc-core\third_party"
$casadiDir = "$thirdPartyDir\casadi"

if (-Not (Test-Path -Path $thirdPartyDir)) {
    New-Item -ItemType Directory -Force -Path $thirdPartyDir
}

Set-Location $thirdPartyDir

Write-Host "Downloading CasADi (C++ binaries bundled with MATLAB release)..."
Invoke-WebRequest -Uri $casadiUrl -OutFile $targetZip

Write-Host "Extracting CasADi..."
if (Test-Path -Path $casadiDir) {
    Remove-Item -Recurse -Force $casadiDir
}
Expand-Archive -Path $targetZip -DestinationPath $casadiDir -Force

Write-Host "Cleaning up..."
Remove-Item $targetZip

Write-Host "CasADi successfully installed to $casadiDir"
Write-Host "NOTE: CasADi bundles IPOPT natively (ipopt.dll is inside the CasADi folder)."
