#requires -Version 7.2
# Synthetic in-memory PGDMP bytes only. No server, credentials or real backups.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$scriptFile = Join-Path $repo 'scripts/offsite-backup-windows.ps1'
$qaRoot = Join-Path $repo '.local/offsite-backup-tests'
$pwsh = (Get-Process -Id $PID).Path
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$utf8 = [System.Text.UTF8Encoding]::new($false, $true)
$testDirs = [System.Collections.Generic.List[string]]::new()
$passed = [System.Collections.Generic.List[string]]::new()
$fixture = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(65541)
[System.Text.Encoding]::ASCII.GetBytes('PGDMP').CopyTo($fixture, 0)
$fixtureHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($fixture))

function Require([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function New-TestDirectory {
  $value = Join-Path $qaRoot ([Guid]::NewGuid().ToString('N'))
  $testDirs.Add($value)
  $prepare = Run-Backup PrepareDirectory $value
  Require ($prepare.code -eq 0) "Private QA directory preparation failed: $($prepare.error)"
  Require (-not (Test-Path -LiteralPath (Join-Path $value 'backup-key.dpapi.json'))) 'Preparation must not generate a key'
  $manifest = @(
    'format=2', 'project=manzanas-maracay-production', 'database=manzanas_maracay_production',
    ('image=sha256:' + ('a' * 64)), 'postgres_version=180006', 'created_utc=20261105T010000Z',
    ('sha256=' + $fixtureHash.ToLowerInvariant()), ('release=phase4-' + ('b' * 12)), ('commit=' + ('b' * 40)),
    'binding_state=production', 'database_instance_id=00000000-0000-4000-8000-000000000001'
  ) -join "`n"
  [System.IO.File]::WriteAllText((Join-Path $value 'fixture.meta'), $manifest + "`n", $utf8)
  return $value
}
function Run-Backup([string]$Action, [string]$Directory, [string[]]$Extra = @(), [byte[]]$InputBytes = @()) {
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $pwsh
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', $scriptFile,
    '-Action', $Action, '-Database', 'manzanas_maracay_production', '-BackupDirectory', $Directory, '-TestOnly') + $Extra) {
    $start.ArgumentList.Add($argument)
  }
  if ($Action -eq 'Encrypt') {
    $start.ArgumentList.Add('-ManifestFile')
    $start.ArgumentList.Add((Join-Path $Directory 'fixture.meta'))
  }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $start
  $output = [System.IO.MemoryStream]::new()
  try {
    [void]$process.Start()
    $copy = $process.StandardOutput.BaseStream.CopyToAsync($output)
    $errors = $process.StandardError.ReadToEndAsync()
    try {
      if ($InputBytes.Length) { $process.StandardInput.BaseStream.Write($InputBytes, 0, $InputBytes.Length) }
      $process.StandardInput.Close()
    } catch [System.Management.Automation.MethodInvocationException] {
      # An early scope/ACL rejection can close stdin before accepting any bytes.
    }
    if (-not $process.WaitForExit(30000)) { $process.Kill($true); throw 'Synthetic backup child timed out' }
    [void]$copy.GetAwaiter().GetResult()
    $errorText = $errors.GetAwaiter().GetResult()
    return @{ code = $process.ExitCode; bytes = $output.ToArray(); error = $errorText }
  } finally { $output.Dispose(); $process.Dispose() }
}
function Require-Rejected($Result, [string]$Case) {
  Require ($Result.code -ne 0 -and $Result.bytes.Length -eq 0) "$Case must fail without any binary/plaintext output"
  Require ($Result.error -notmatch 'PGDMP|protectedKey|ciphertext') "$Case leaked private fields"
  $passed.Add($Case)
}

try {
  $first = New-TestDirectory
  $encrypted = Run-Backup Encrypt $first @('-OutputName', 'fixture.mmbackup') $fixture
  Require ($encrypted.code -eq 0) "Encryption failed: $($encrypted.error)"
  $summary = $utf8.GetString($encrypted.bytes) | ConvertFrom-Json
  Require ($summary.status -eq 'encrypted' -and -not $summary.restoreVerified) 'Encryption must not claim PostgreSQL restoration'
  $archive = Join-Path $first 'fixture.mmbackup'
  Require ($summary.file -eq $archive -and $summary.plainLength -eq $fixture.Length) 'Incorrect encrypted result metadata'
  Require (@(Get-ChildItem -LiteralPath $first -File | Where-Object Extension -eq '.dump').Count -eq 0) 'Unexpected plaintext file'
  $decrypted = Run-Backup Decrypt $first @('-InputFile', $archive)
  Require ($decrypted.code -eq 0) "Decryption failed: $($decrypted.error)"
  Require ($decrypted.bytes.Length -eq $fixture.Length -and [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($decrypted.bytes)) -eq $fixtureHash) 'Roundtrip changed bytes'
  [Array]::Clear($decrypted.bytes, 0, $decrypted.bytes.Length)
  $passed.Add('binary roundtrip without plaintext files')

  foreach ($path in @($first, $archive, (Join-Path $first 'backup-key.dpapi.json'))) {
    $acl = Get-Acl -LiteralPath $path
    Require ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $sid.Value) 'Owner SID mismatch'
    $allows = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | Where-Object AccessControlType -eq Allow)
    Require ($allows.Count -eq 2) 'Private ACL should allow only owner and SYSTEM'
    foreach ($rule in $allows) { Require ($rule.IdentityReference.Value -in @($sid.Value, 'S-1-5-18')) 'Unexpected principal in private ACL' }
  }
  $passed.Add('owner SID and SYSTEM ACL only')
  $originalHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  Require-Rejected (Run-Backup Encrypt $first @('-OutputName', 'fixture.mmbackup') $fixture) 'exclusive create refuses existing ciphertext'
  Require ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -eq $originalHash) 'Existing ciphertext was changed'

  $original = [System.IO.File]::ReadAllText($archive, $utf8)
  $tagMatch = [regex]::Match($original, '"tag":"([^"]+)"')
  Require $tagMatch.Success 'Missing tag fixture'
  $tag = [Convert]::FromBase64String($tagMatch.Groups[1].Value)
  $tag[0] = $tag[0] -bxor 1
  $tampered = Join-Path $first 'tampered.mmbackup'
  [System.IO.File]::WriteAllText($tampered, $original.Replace($tagMatch.Groups[1].Value, [Convert]::ToBase64String($tag)), $utf8)
  Require-Rejected (Run-Backup Decrypt $first @('-InputFile', $tampered)) 'GCM tag tampering rejected'
  [System.IO.File]::WriteAllText($tampered, $original.Replace($summary.sha256, ('0' * 64)), $utf8)
  Require-Rejected (Run-Backup Decrypt $first @('-InputFile', $tampered)) 'authenticated metadata tampering rejected'
  $manifestMatch = [regex]::Match($original, '"manifestBase64":"([^"]+)"')
  $changedManifest = [Convert]::FromBase64String($manifestMatch.Groups[1].Value)
  $changedManifest[$changedManifest.Length - 1] = 32
  [System.IO.File]::WriteAllText($tampered, $original.Replace($manifestMatch.Groups[1].Value, [Convert]::ToBase64String($changedManifest)), $utf8)
  Require-Rejected (Run-Backup Decrypt $first @('-InputFile', $tampered)) 'restore manifest tampering rejected'
  [System.IO.File]::WriteAllText($tampered, $original.Substring(0, $original.Length - 1) + ',"plainLength":65541}', $utf8)
  Require-Rejected (Run-Backup Decrypt $first @('-InputFile', $tampered)) 'duplicate JSON metadata rejected'

  $second = New-TestDirectory
  $secondResult = Run-Backup Encrypt $second @('-OutputName', 'other.mmbackup') $fixture
  Require ($secondResult.code -eq 0) 'Second synthetic key could not be created'
  $firstKey = [System.IO.File]::ReadAllText((Join-Path $first 'backup-key.dpapi.json'), $utf8) | ConvertFrom-Json -AsHashtable
  $secondKeyPath = Join-Path $second 'backup-key.dpapi.json'
  $secondKey = [System.IO.File]::ReadAllText($secondKeyPath, $utf8) | ConvertFrom-Json -AsHashtable
  $secondKey.keyId = $firstKey.keyId
  [System.IO.File]::WriteAllText($secondKeyPath, ($secondKey | ConvertTo-Json -Compress), $utf8)
  $wrongKeyArchive = Join-Path $second 'wrong-key.mmbackup'
  [System.IO.File]::WriteAllText($wrongKeyArchive, $original, $utf8)
  Require-Rejected (Run-Backup Decrypt $second @('-InputFile', $wrongKeyArchive)) 'different AES key rejected even with matching key ID'

  $savedAcl = Get-Acl -LiteralPath $archive
  $wideAcl = Get-Acl -LiteralPath $archive
  $wideAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'), [System.Security.AccessControl.FileSystemRights]::Read,
    [System.Security.AccessControl.AccessControlType]::Allow))
  Set-Acl -LiteralPath $archive -AclObject $wideAcl
  try { Require-Rejected (Run-Backup Decrypt $first @('-InputFile', $archive)) 'public read ACL rejected' }
  finally { Set-Acl -LiteralPath $archive -AclObject $savedAcl }

  Require-Rejected (Run-Backup Encrypt (Join-Path $qaRoot 'outside-scope') @() $fixture) 'non-test destination rejected'
  Require (-not (Test-Path -LiteralPath (Join-Path $qaRoot 'outside-scope'))) 'Rejected scope created a directory'
  Require-Rejected (Run-Backup Encrypt $first @('-OutputName', 'invalid.mmbackup') $utf8.GetBytes('invalid bytes')) 'non-PGDMP plaintext rejected'
  [ordered]@{ status = 'passed'; count = $passed.Count; checks = $passed.ToArray(); realBackupsUsed = $false; remoteCalls = 0 } | ConvertTo-Json -Depth 4
} finally {
  [Array]::Clear($fixture, 0, $fixture.Length)
  foreach ($directory in $testDirs) {
    $resolved = [System.IO.Path]::GetFullPath($directory)
    if ([System.IO.Path]::GetDirectoryName($resolved) -ne $qaRoot -or [System.IO.Path]::GetFileName($resolved) -notmatch '^[a-f0-9]{32}$') { throw 'Refusing cleanup outside exact synthetic directory' }
    if (Test-Path -LiteralPath $resolved) {
      if (((Get-Item -Force -LiteralPath $resolved).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing linked test directory cleanup' }
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}
