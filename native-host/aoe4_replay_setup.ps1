# AoE4 Replay Launcher - Setup Script
# Called by install.bat — creates all needed files and registers the native host.

param(
    [string]$ExtensionId,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'AoE4ReplayLauncher'),
    [ValidateSet('Steam', 'MicrosoftStore')]
    [string]$Launcher = 'Steam',
    [switch]$Uninstall
)

$hostName = 'com.aoe4.replay_launcher'
$regPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)

if ($Uninstall) {
    foreach ($rp in $regPaths) { Remove-Item $rp -Force -ErrorAction SilentlyContinue }
    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Uninstalled from $InstallDir"
    return
}

# Create install directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# --- Write aoe4_replay_host.bat ---
$batPath = Join-Path $InstallDir 'aoe4_replay_host.bat'
@'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0aoe4_replay_host.ps1"
'@ | Set-Content $batPath -Encoding ASCII

# --- Write aoe4_replay_host.ps1 ---
$ps1Path = Join-Path $InstallDir 'aoe4_replay_host.ps1'
$hostScript = @'
$REPLAY_API = 'https://aoe-api.worldsedgelink.com/community/leaderboard/getReplayFiles'
$UA = 'AoE4ReplayLauncher/0.4 (https://github.com/spartain-aoe/aoe4world-replay-extension, discord:591850595498065931)'
$AOE4_STEAM_ID = '1466860'
$AOE4_EXE_NAMES = @('RelicCardinal_ws.exe', 'RelicCardinal.exe')
$LAUNCHER = '__LAUNCHER__'
$docsDir = [Environment]::GetFolderPath('MyDocuments')
$playbackDir = Join-Path $docsDir 'My Games\Age of Empires IV\playback'

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

function Ensure-PlaybackDir {
    if (-not (Test-Path $playbackDir)) {
        New-Item -ItemType Directory -Path $playbackDir -Force | Out-Null
    }
}

function Invoke-Replay($matchId) {
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
    Ensure-PlaybackDir
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
    $launch = Launch-Game $replayName
    return @{
        success = $true
        replay = $replayName
        replayPath = $replayPath
        launcher = $LAUNCHER
        message = $launch.message
    }
}

function Launch-Game($replayName) {
    if ($LAUNCHER -eq 'MicrosoftStore') {
        return Launch-MicrosoftStoreGame $replayName
    }
    return Launch-SteamGame $replayName
}

function Stop-RunningAoE4 {
    $proc = Get-Process RelicCardinal, RelicCardinal_ws -ErrorAction SilentlyContinue
    if ($proc) {
        $proc | ForEach-Object { Stop-Process -Id $_.Id -Force }
        Start-Sleep -Seconds 3
    }
}

function Launch-SteamGame($replayName) {
    Stop-RunningAoE4
    $steamKey = Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction Stop
    & $steamKey.SteamExe -applaunch $AOE4_STEAM_ID -dev -replay "playback:$replayName"
    return @{ message = 'Launched replay in AoE4 via Steam.' }
}

function Get-AoE4StartApp {
    $apps = Get-StartApps | Where-Object {
        $_.Name -match 'Age of Empires IV|Age of Empires 4|AoE4|AoE IV' -or
        $_.AppID -match 'Cardinal|Age.*Empires.*IV|Age.*Empires.*4'
    }
    return $apps | Select-Object -First 1
}

function Find-ExecutableInRoot($root) {
    if (-not $root -or -not (Test-Path $root)) { return $null }
    foreach ($name in $AOE4_EXE_NAMES) {
        $direct = Join-Path $root $name
        if (Test-Path $direct) { return $direct }
    }
    foreach ($name in $AOE4_EXE_NAMES) {
        $hit = Get-ChildItem -Path $root -Filter $name -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

function Find-AoE4Executable {
    $roots = New-Object System.Collections.ArrayList
    $seen = @{}
    function Add-Root($path) {
        if (-not $path) { return }
        try {
            $resolved = [System.IO.Path]::GetFullPath($path)
        } catch {
            return
        }
        if (-not (Test-Path $resolved) -or $seen.ContainsKey($resolved)) { return }
        $seen[$resolved] = $true
        [void]$roots.Add($resolved)
    }

    try {
        $startApp = Get-AoE4StartApp
        if ($startApp -and $startApp.AppID -match '^([^!]+)!') {
            $familyName = $Matches[1]
            $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $familyName } | Select-Object -First 1
            if ($pkg) { Add-Root $pkg.InstallLocation }
        }
    } catch {}

    try {
        Get-AppxPackage | Where-Object {
            $_.Name -match 'Cardinal|Age.*Empires' -or
            $_.PackageFullName -match 'Cardinal|Age.*Empires' -or
            $_.PackageFamilyName -match 'Cardinal|Age.*Empires'
        } | ForEach-Object { Add-Root $_.InstallLocation }
    } catch {}

    foreach ($regRoot in @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )) {
        try {
            Get-ItemProperty $regRoot -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -match 'Age of Empires IV|Age of Empires 4|AoE4' } |
                ForEach-Object {
                    Add-Root $_.InstallLocation
                    if ($_.DisplayIcon) { Add-Root (Split-Path $_.DisplayIcon -Parent) }
                }
        } catch {}
    }

    $driveRoots = Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }
    foreach ($driveRoot in $driveRoots) {
        foreach ($parent in @(
            (Join-Path $driveRoot 'XboxGames'),
            (Join-Path $driveRoot 'Program Files\ModifiableWindowsApps'),
            (Join-Path $driveRoot 'Program Files\WindowsApps')
        )) {
            if (-not (Test-Path $parent)) { continue }
            try {
                Get-ChildItem -Path $parent -Directory -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -match 'Age.*Empires|AoE4|Cardinal' } |
                    ForEach-Object {
                        Add-Root $_.FullName
                        Add-Root (Join-Path $_.FullName 'Content')
                    }
            } catch {}
        }
    }

    foreach ($root in $roots) {
        $exe = Find-ExecutableInRoot $root
        if ($exe) { return $exe }
    }
    return $null
}

function Launch-MicrosoftStoreGame($replayName) {
    Stop-RunningAoE4
    $exe = Find-AoE4Executable
    if (-not $exe) {
        throw 'Could not find the Microsoft Store/Xbox AoE4 executable. The launcher needs an accessible RelicCardinal executable so it can pass replay command-line arguments.'
    }
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe -Parent) -ArgumentList @('-dev', '-replay', "playback:$replayName")
    return @{
        message = 'Launched replay in AoE4 via Microsoft Store/Xbox executable.'
    }
}

function Invoke-ReplayFromData($matchId, $replayB64) {
    if ($matchId -notmatch '^\d+$') {
        return @{ success = $false; error = 'Invalid match ID' }
    }
    $replayName = "AgeIV_Replay_$matchId"
    $replayPath = Join-Path $playbackDir $replayName
    Ensure-PlaybackDir
    $gzBytes = [Convert]::FromBase64String($replayB64)
    $ms = New-Object System.IO.MemoryStream(,$gzBytes)
    $gzStream = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
    $outStream = [System.IO.File]::Create($replayPath)
    $gzStream.CopyTo($outStream)
    $outStream.Dispose(); $gzStream.Dispose(); $ms.Dispose()
    $launch = Launch-Game $replayName
    return @{
        success = $true
        replay = $replayName
        replayPath = $replayPath
        launcher = $LAUNCHER
        message = $launch.message
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
'@
$hostScript.Replace('__LAUNCHER__', $Launcher) | Set-Content $ps1Path -Encoding UTF8

# --- Write native messaging manifest ---
$manifestPath = Join-Path $InstallDir "$hostName.json"
$escapedBat = $batPath.Replace('\', '\\')
@"
{
  "name": "$hostName",
  "description": "AoE4 Replay Launcher ($Launcher) - downloads and plays AoE4 replays",
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

Write-Host "  Installed to $InstallDir"
