# AoE4 Replay Launcher - Setup Script
# Called by install.bat — creates all needed files and registers the native host.

param(
    [string]$ExtensionId,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'AoE4ReplayLauncher'),
    [switch]$Uninstall,
    # Write only the host script files (bat + ps1); skip the native-messaging
    # manifest and all registry registration. Used by tests and to refresh the
    # host script without disturbing an existing manifest's allowed_origins.
    [switch]$FilesOnly,
    # Register only the aoe4rep:// URL protocol against an existing install.
    [switch]$ProtocolOnly
)

$hostName = 'com.aoe4.replay_launcher'
$protocolRoot = 'HKCU:\Software\Classes\aoe4rep'
$regPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)

$batPath = Join-Path $InstallDir 'aoe4_replay_host.bat'
$ps1Path = Join-Path $InstallDir 'aoe4_replay_host.ps1'

# Registers the aoe4rep:// custom URL protocol so deep links like
# aoe4rep://m/243976528 launch the replay via the installed host script.
function Register-Aoe4RepProtocol {
    New-Item -Path $protocolRoot -Force | Out-Null
    Set-ItemProperty -Path $protocolRoot -Name '(Default)' -Value 'URL:AoE4 Replay Launcher'
    Set-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value ''
    $cmdKey = Join-Path $protocolRoot 'shell\open\command'
    New-Item -Path $cmdKey -Force | Out-Null
    $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1Path`" -Url `"%1`""
    Set-ItemProperty -Path $cmdKey -Name '(Default)' -Value $cmd
}

if ($Uninstall) {
    foreach ($rp in $regPaths) { Remove-Item $rp -Force -ErrorAction SilentlyContinue }
    Remove-Item $protocolRoot -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Uninstalled from $InstallDir"
    return
}

if ($ProtocolOnly) {
    Register-Aoe4RepProtocol
    Write-Host "  Registered aoe4rep:// -> $ps1Path"
    return
}

# Create install directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# --- Write aoe4_replay_host.bat ---
@'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0aoe4_replay_host.ps1"
'@ | Set-Content $batPath -Encoding ASCII

# --- Write aoe4_replay_host.ps1 ---
@'
param([string]$Url, [switch]$NoLaunch)

$REPLAY_API = 'https://aoe-api.worldsedgelink.com/community/leaderboard/getReplayFiles'
$UA = 'AoE4ReplayLauncher/0.4 (https://github.com/spartain-aoe/aoe4world-replay-extension, discord:591850595498065931)'
$AOE4_STEAM_ID = '1466860'
$docsDir = [Environment]::GetFolderPath('MyDocuments')
$playbackDir = Join-Path $docsDir 'My Games\Age of Empires IV\playback'
$logPath = Join-Path $PSScriptRoot 'protocol.log'

# Extract the numeric match ID from an aoe4rep:// deep link, e.g.
#   aoe4rep://m/243976528   ->  243976528
# Tolerates a trailing slash, query/fragment, surrounding quotes/whitespace,
# a case-insensitive scheme/path, and a bare id without the m/ segment.
# Returns $null for anything that is not an aoe4rep link ending in digits.
function Get-ReplayMatchIdFromUrl {
    param([string]$RawUrl)
    if ([string]::IsNullOrWhiteSpace($RawUrl)) { return $null }
    $clean = $RawUrl.Trim().Trim('"').Trim("'").Trim()
    if ($clean -notmatch '^(?i:aoe4rep:)') { return $null }
    $rest = $clean -replace '^(?i:aoe4rep:)(?://)?', ''
    $rest = ($rest -split '[?#]', 2)[0]
    $rest = $rest.Trim('/')
    if ($rest -match '^(?i:m/)?(\d+)$') { return $Matches[1] }
    return $null
}

function Write-Log($text) {
    try {
        $stamp = (Get-Date).ToString('s')
        Add-Content -Path $logPath -Value "$stamp $text" -Encoding UTF8 -ErrorAction Stop
    } catch { }
}

# Best-effort message box for protocol-mode failures (there is no native
# messaging channel to report back through when launched from a deep link).
function Show-LauncherError($text) {
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        [System.Windows.Forms.MessageBox]::Show($text, 'AoE4 Replay Launcher',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    } catch { }
}

function Read-Message {
    $stdin = [Console]::OpenStandardInput()
    $lenBuf = New-Object byte[] 4
    $read = $stdin.Read($lenBuf, 0, 4)
    if ($read -lt 4) { return $null }
    $len = [BitConverter]::ToInt32($lenBuf, 0)
    if ($len -le 0 -or $len -gt 1048576) { return $null }
    $msgBuf = New-Object byte[] $len
    $total = 0
    while ($total -lt $len) {
        $n = $stdin.Read($msgBuf, $total, $len - $total)
        if ($n -le 0) { return $null }
        $total += $n
    }
    return ([System.Text.Encoding]::UTF8.GetString($msgBuf) | ConvertFrom-Json)
}

function Write-Message($obj) {
    $json = ($obj | ConvertTo-Json -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $lenBuf = [BitConverter]::GetBytes([int]$bytes.Length)
    $stdout = [Console]::OpenStandardOutput()
    $stdout.Write($lenBuf, 0, 4)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

function Invoke-Replay {
    param([string]$matchId, [switch]$NoLaunch)
    if ($matchId -notmatch '^\d+$') {
        return @{ success = $false; error = 'Invalid match ID' }
    }
    $replayName = "AgeIV_Replay_$matchId"
    $replayPath = Join-Path $playbackDir $replayName
    $apiUrl = "${REPLAY_API}?matchIDs=%5B${matchId}%5D&title=age4"
    $response = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = $UA }
    if ($response.result.code -ne 0) {
        return @{ success = $false; error = $response.result.message }
    }
    $replayFile = $response.replayFiles |
        Where-Object { $_.datatype -eq 0 -and $_.size -gt 0 } |
        Sort-Object size -Descending | Select-Object -First 1
    if (-not $replayFile) {
        return @{ success = $false; error = 'No replay file found' }
    }
    $tempFile = [System.IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $replayFile.url -OutFile $tempFile -UserAgent $UA
        $inStream = [System.IO.File]::OpenRead($tempFile)
        $gzStream = New-Object System.IO.Compression.GZipStream(
            $inStream, [System.IO.Compression.CompressionMode]::Decompress)
        $outStream = [System.IO.File]::Create($replayPath)
        $gzStream.CopyTo($outStream)
        $outStream.Dispose(); $gzStream.Dispose(); $inStream.Dispose()
    } finally {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
    if (-not $NoLaunch) { Launch-Game $replayName }
    return @{ success = $true; replay = $replayName; launched = (-not $NoLaunch.IsPresent) }
}

function Launch-Game($replayName) {
    $proc = Get-Process RelicCardinal -ErrorAction SilentlyContinue
    if ($proc) {
        $proc | ForEach-Object { Stop-Process -Id $_.Id -Force }
        Start-Sleep -Seconds 3
    }
    $steamKey = Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction Stop
    & $steamKey.SteamExe -applaunch $AOE4_STEAM_ID -dev -replay "playback:$replayName"
}

function Invoke-ReplayFromData($matchId, $replayB64) {
    if ($matchId -notmatch '^\d+$') {
        return @{ success = $false; error = 'Invalid match ID' }
    }
    $replayName = "AgeIV_Replay_$matchId"
    $replayPath = Join-Path $playbackDir $replayName
    $gzBytes = [Convert]::FromBase64String($replayB64)
    $ms = New-Object System.IO.MemoryStream(,$gzBytes)
    $gzStream = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
    $outStream = [System.IO.File]::Create($replayPath)
    $gzStream.CopyTo($outStream)
    $outStream.Dispose(); $gzStream.Dispose(); $ms.Dispose()
    Launch-Game $replayName
    return @{ success = $true; replay = $replayName }
}

if ($MyInvocation.InvocationName -ne '.') {
    if ($Url) {
        # Protocol mode: launched from an aoe4rep:// deep link.
        Write-Log "protocol invoked: $Url"
        $matchId = Get-ReplayMatchIdFromUrl $Url
        if (-not $matchId) {
            Write-Log "could not parse a match id from: $Url"
            Show-LauncherError "Could not read a replay match ID from:`n$Url"
            exit 1
        }
        try {
            $result = Invoke-Replay -matchId $matchId -NoLaunch:$NoLaunch
            if ($result.success) {
                Write-Log "ok match $matchId (replay $($result.replay), launched=$($result.launched))"
                exit 0
            }
            Write-Log "failed match $matchId : $($result.error)"
            Show-LauncherError "Replay $matchId could not be launched:`n$($result.error)"
            exit 1
        } catch {
            Write-Log "exception match $matchId : $($_.Exception.Message)"
            Show-LauncherError "Replay $matchId error:`n$($_.Exception.Message)"
            exit 1
        }
    }
    $msg = Read-Message
    if ($msg -and $msg.action -eq 'launchReplayData' -and $msg.matchId -and $msg.replayB64) {
        try {
            $result = Invoke-ReplayFromData $msg.matchId $msg.replayB64
            Write-Message $result
        } catch {
            Write-Message @{ success = $false; error = $_.Exception.Message }
        }
    } elseif ($msg -and $msg.action -eq 'launchReplay' -and $msg.matchId) {
        try {
            $result = Invoke-Replay $msg.matchId
            Write-Message $result
        } catch {
            Write-Message @{ success = $false; error = $_.Exception.Message }
        }
    } else {
        Write-Message @{ success = $false; error = 'Invalid message' }
    }
}
'@ | Set-Content $ps1Path -Encoding UTF8

if ($FilesOnly) {
    Write-Host "  Host files written to $InstallDir (skipped manifest/registration)"
    return
}

# --- Write native messaging manifest ---
$manifestPath = Join-Path $InstallDir "$hostName.json"
$escapedBat = $batPath.Replace('\', '\\')
@"
{
  "name": "$hostName",
  "description": "AoE4 Replay Launcher - downloads and plays AoE4 replays",
  "path": "$escapedBat",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$ExtensionId/"
  ]
}
"@ | Set-Content $manifestPath -Encoding UTF8

# --- Register with Chrome and Edge ---
foreach ($rp in $regPaths) {
    New-Item -Path $rp -Force | Out-Null
    Set-ItemProperty -Path $rp -Name '(Default)' -Value $manifestPath
}

# --- Register the aoe4rep:// URL protocol (deep links) ---
Register-Aoe4RepProtocol

Write-Host "  Installed to $InstallDir"
