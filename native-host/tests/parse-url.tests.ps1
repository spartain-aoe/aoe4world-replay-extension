# Tests for the aoe4rep:// deep-link parser in the native host.
#
# Generates the real host script via `aoe4_replay_setup.ps1 -FilesOnly` into a
# temp dir (touches no registry, writes no manifest), dot-sources it so only the
# functions are defined (the dot-source guard skips the stdin/native-messaging
# main), then asserts Get-ReplayMatchIdFromUrl on aoe4rep://m/<id> and variants.
#
# Runs under Windows PowerShell 5.1 (the host runtime) or PowerShell 7+.
# Run:  powershell.exe -NoProfile -ExecutionPolicy Bypass -File native-host\tests\parse-url.tests.ps1
# Exit: 0 = all pass, 1 = one or more failures.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$setup = Join-Path (Split-Path -Parent $here) 'aoe4_replay_setup.ps1'
$tmp = Join-Path $env:TEMP ('aoe4_parse_test_' + [Guid]::NewGuid().ToString('N'))

# Generate the host script exactly as an install would produce it.
& $setup -ExtensionId 'test' -InstallDir $tmp -FilesOnly | Out-Null
$hostScript = Join-Path $tmp 'aoe4_replay_host.ps1'
if (-not (Test-Path $hostScript)) { Write-Host "FAIL: host script not generated"; exit 1 }

# Dot-source: defines functions; guard skips the native-messaging main.
. $hostScript

$fail = 0
function Show($v) { if ($null -eq $v) { '<null>' } else { "'$v'" } }
function Check($url, $expected) {
    $label = Show $url
    try {
        $actual = Get-ReplayMatchIdFromUrl $url
    } catch {
        Write-Host ("  FAIL {0} -> threw: {1}" -f $label, $_.Exception.Message)
        $script:fail++
        return
    }
    if ($actual -eq $expected) {
        Write-Host ("  ok   {0} -> {1}" -f $label, (Show $expected))
    } else {
        Write-Host ("  FAIL {0} -> got {1}, expected {2}" -f $label, (Show $actual), (Show $expected))
        $script:fail++
    }
}

Write-Host "aoe4rep:// URL parsing"
Check 'aoe4rep://m/243976528'          '243976528'   # the canonical form
Check 'aoe4rep://m/243976528/'         '243976528'   # trailing slash (Windows adds one)
Check 'AOE4REP://M/243976528'          '243976528'   # case-insensitive scheme + path
Check 'aoe4rep://m/243976528?x=1'      '243976528'   # query string
Check 'aoe4rep://m/243976528#frag'     '243976528'   # fragment
Check 'aoe4rep://243976528'            '243976528'   # bare id (no m/ segment)
Check '  "aoe4rep://m/243976528"  '    '243976528'   # padded + quoted (shell passthrough)
Check 'https://aoe4world.com/games/1'  $null         # wrong scheme
Check 'aoe4rep://m/notanumber'         $null         # non-numeric
Check 'aoe4rep://'                     $null         # no id
Check 'aoe4rep://m/'                   $null         # m/ but no id
Check ''                               $null         # empty
Check $null                            $null         # null

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

if ($fail -gt 0) {
    Write-Host ("FAILED: {0} case(s)" -f $fail)
    exit 1
}
Write-Host "PASSED: all cases"
exit 0
