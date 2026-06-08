# scrum CLI installer for Windows.
#
# Usage (PowerShell):
#   iwr -useb https://raw.githubusercontent.com/viscosityna/scrum/main/install.ps1 | iex
#
# Honours these env vars (rarely needed):
#   SCRUM_INSTALL_DIR  override install location (default: %USERPROFILE%\.scrum\bin)
#   SCRUM_VERSION      pin to a specific tag (default: latest)

$ErrorActionPreference = 'Stop'

$Repo       = 'viscosityna/scrum'
$InstallDir = if ($env:SCRUM_INSTALL_DIR) { $env:SCRUM_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.scrum\bin' }
$ExePath    = Join-Path $InstallDir 'scrum.exe'
$Asset      = 'scrum-win-x64.exe'

# ----- resolve download URL -----
$Url = if ($env:SCRUM_VERSION) {
  "https://github.com/$Repo/releases/download/$($env:SCRUM_VERSION)/$Asset"
} else {
  "https://github.com/$Repo/releases/latest/download/$Asset"
}

# ----- download + install -----
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Host "scrum: downloading $Asset..."
try {
  Invoke-WebRequest -Uri $Url -OutFile $ExePath -UseBasicParsing
} catch {
  Write-Error "scrum: download failed from $Url. The release may not exist yet — check https://github.com/$Repo/releases"
  exit 1
}

# ----- verify integrity (SHA256 against the release's checksums.txt) -----
$ChecksumUrl = $Url -replace "/$Asset$", '/checksums.txt'
try {
  $ChecksumText = (Invoke-WebRequest -Uri $ChecksumUrl -UseBasicParsing).Content
} catch {
  Remove-Item $ExePath -ErrorAction SilentlyContinue
  Write-Error "scrum: could not retrieve checksum for $Asset from $ChecksumUrl. Refusing to install an unverified binary."
  exit 1
}
$Expected = $null
foreach ($line in ($ChecksumText -split "`n")) {
  $parts = ($line.Trim() -split '\s+')
  if ($parts.Length -ge 2 -and $parts[1] -eq $Asset) {
    $Expected = $parts[0].ToLower()
    break
  }
}
if (-not $Expected) {
  Remove-Item $ExePath -ErrorAction SilentlyContinue
  Write-Error "scrum: $Asset is not listed in checksums.txt. Refusing to install an unverified binary."
  exit 1
}
$Actual = (Get-FileHash -Path $ExePath -Algorithm SHA256).Hash.ToLower()
if ($Expected -ne $Actual) {
  Remove-Item $ExePath -ErrorAction SilentlyContinue
  Write-Error "scrum: SHA256 mismatch. Expected $Expected, got $Actual. Aborting install."
  exit 1
}

# ----- add to PATH (user-scope, no admin needed) -----
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$AlreadyOnPath = ($UserPath -split ';') -contains $InstallDir
if (-not $AlreadyOnPath) {
  $NewPath = if ($UserPath) { "$UserPath;$InstallDir" } else { $InstallDir }
  [Environment]::SetEnvironmentVariable('Path', $NewPath, 'User')
  # also update this session so the user can call scrum without restarting first
  $env:Path = "$env:Path;$InstallDir"
}

# ----- friendly outro -----
Write-Host ""
Write-Host "scrum installed at $ExePath"
try { & $ExePath --version } catch { }
Write-Host ""
if (-not $AlreadyOnPath) {
  Write-Host "Added $InstallDir to your user PATH. Open a new PowerShell window if scrum isn't on PATH here."
}
Write-Host "Next step:  scrum login"
