#requires -Version 7.2
<#
  Private, local AES-256-GCM backups. Plaintext is accepted from redirected stdin
  and returned only through redirected binary stdout after full authentication.
  DPAPI CurrentUser binds the key to this Windows account/computer. Losing both
  that account/computer and its recovery material can make these backups unusable.
  This script does not contact a server or claim PostgreSQL restoration succeeded.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('PrepareDirectory', 'Encrypt', 'Decrypt')][string]$Action,
  [Parameter(Mandatory)][ValidateSet('manzanas_maracay_production')][string]$Database,
  [string]$BackupDirectory = 'C:\Users\gordis\Documents\Codex\Backups-privados\Manzanas-Maracay',
  [string]$InputFile,
  [string]$ManifestFile,
  [string]$OutputName,
  [switch]$TestOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$stage = 'platform'
$keyBytes = $null
$plainBytes = $null
$lock = $null
$aes = $null
$utf8 = [System.Text.UTF8Encoding]::new($false, $true)
$maxPlainBytes = 128MB
$expectedSchema = 'manzanas-offsite-backup/v1'
$entropy = $utf8.GetBytes('Manzanas-Maracay/DPAPI-backup-key/v1')

function Assert-NoReparse([string]$Path) {
  $cursor = [System.IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -Force -LiteralPath $cursor
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse-point' }
    }
    $parent = [System.IO.Directory]::GetParent($cursor)
    if ($null -eq $parent) { break }
    $cursor = $parent.FullName
  }
}

function Assert-PrivateAcl([string]$Path, [System.Security.Principal.SecurityIdentifier]$Sid) {
  $acl = Get-Acl -LiteralPath $Path
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $Sid.Value) { throw 'unexpected-owner' }
  $foundUser = $false
  $foundSystem = $false
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow) {
      if ($rule.IdentityReference.Value -eq $Sid.Value) { $foundUser = $true }
      elseif ($rule.IdentityReference.Value -eq 'S-1-5-18') { $foundSystem = $true }
      else { throw 'unexpected-access-rule' }
    }
  }
  if (-not $foundUser -or -not $foundSystem) { throw 'missing-private-access' }
}

function New-PrivateDirectory([string]$Path, [System.Security.Principal.SecurityIdentifier]$Sid) {
  if (Test-Path -LiteralPath $Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw 'not-directory' }
    Assert-PrivateAcl $Path $Sid
    return
  }
  [void][System.IO.Directory]::CreateDirectory($Path)
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($Sid)
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  foreach ($principal in @($Sid, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($principal, [System.Security.AccessControl.FileSystemRights]::FullControl,
      $inherit, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
  Assert-PrivateAcl $Path $Sid
}

function Write-NewPrivateFile([string]$Path, [byte[]]$Data, [System.Security.Principal.SecurityIdentifier]$Sid) {
  Assert-NoReparse $Path
  $stream = [System.IO.FileStream]::new($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try { $stream.Write($Data, 0, $Data.Length); $stream.Flush($true) }
  finally { $stream.Dispose() }
  Assert-PrivateAcl $Path $Sid
}

function Read-PrivateJson([string]$Path, [long]$Maximum, [System.Security.Principal.SecurityIdentifier]$Sid) {
  Assert-NoReparse $Path
  Assert-PrivateAcl $Path $Sid
  $info = Get-Item -LiteralPath $Path
  if ($info.PSIsContainer -or $info.Length -lt 1 -or $info.Length -gt $Maximum) { throw 'file-size' }
  $content = [System.IO.File]::ReadAllBytes($Path)
  # JsonDocument preserves ISO timestamps as exact strings on all supported
  # PowerShell versions; ConvertFrom-Json date coercion would change the AAD.
  $document = [System.Text.Json.JsonDocument]::Parse($utf8.GetString($content))
  try {
    if ($document.RootElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Object) { throw 'json-object-required' }
    $result = @{}
    foreach ($property in $document.RootElement.EnumerateObject()) {
      if ($result.ContainsKey($property.Name)) { throw 'duplicate-json-field' }
      switch ($property.Value.ValueKind) {
        ([System.Text.Json.JsonValueKind]::String) { $result[$property.Name] = $property.Value.GetString() }
        ([System.Text.Json.JsonValueKind]::Number) { $result[$property.Name] = $property.Value.GetInt64() }
        default { throw 'unexpected-json-field-type' }
      }
    }
    return $result
  } finally { $document.Dispose() }
}

function Assert-Manifest([byte[]]$Bytes, [string]$ExpectedHash) {
  if ($Bytes.Length -lt 1 -or $Bytes.Length -gt 4096) { throw 'manifest-size' }
  $content = $utf8.GetString($Bytes)
  if ($content -match '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') { throw 'manifest-controls' }
  $fields = @{}
  foreach ($line in ($content -split '\r?\n')) {
    if (-not $line) { continue }
    if ($line -notmatch '^([a-z][a-z0-9_]+)=(.*)$' -or $fields.ContainsKey($Matches[1])) { throw 'manifest-format' }
    $fields[$Matches[1]] = $Matches[2]
  }
  if ($fields.Count -ne 11 -or $fields.format -ne '2' -or $fields.database -ne $Database -or
      $fields.project -ne $Database.Replace('_', '-') -or $fields.sha256 -cne $ExpectedHash -or
      $fields.image -notmatch '^sha256:[a-f0-9]{64}$' -or $fields.postgres_version -notmatch '^18[0-9]{4}$' -or
      $fields.created_utc -notmatch '^[0-9]{8}T[0-9]{6}Z$' -or $fields.commit -notmatch '^[a-f0-9]{40}$' -or
      $fields.release -cne ('phase4-' + $fields.commit.Substring(0, 12)) -or
      -not (($fields.binding_state -eq 'production' -and $fields.database_instance_id -match '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') -or
        ($fields.binding_state -eq 'uninitialized' -and $fields.database_instance_id -eq 'unbound'))) { throw 'manifest-identity' }
}

function Get-Aad($Envelope) {
  $value = [ordered]@{
    schema = $Envelope.schema
    algorithm = $Envelope.algorithm
    keyId = $Envelope.keyId
    database = $Envelope.database
    createdAt = $Envelope.createdAt
    sha256 = $Envelope.sha256
    plainLength = [long]$Envelope.plainLength
    manifestBase64 = $Envelope.manifestBase64
    manifestSha256 = $Envelope.manifestSha256
  }
  return ,$utf8.GetBytes(($value | ConvertTo-Json -Compress -Depth 4))
}

function Read-InputBytes {
  if (-not [Console]::IsInputRedirected) { throw 'redirected-input-required' }
  $inputStream = [Console]::OpenStandardInput()
  $memory = [System.IO.MemoryStream]::new()
  $buffer = [byte[]]::new(65536)
  try {
    while (($count = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      if ($memory.Length + $count -gt $maxPlainBytes) { throw 'input-limit-128MiB' }
      $memory.Write($buffer, 0, $count)
    }
    return ,$memory.ToArray()
  } finally {
    $backingBuffer = $memory.GetBuffer()
    [Array]::Clear($backingBuffer, 0, $backingBuffer.Length)
    $memory.Dispose()
    [Array]::Clear($buffer, 0, $buffer.Length)
  }
}

try {
  if (-not $IsWindows -or -not [System.Security.Cryptography.AesGcm]::IsSupported) { throw 'unsupported-platform' }
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $stage = 'scope'
  $directory = [System.IO.Path]::GetFullPath($BackupDirectory).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $authorized = 'C:\Users\gordis\Documents\Codex\Backups-privados\Manzanas-Maracay'
  if ($TestOnly) {
    $qaRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path $PSScriptRoot -Parent) '.local/offsite-backup-tests'))
    if (-not $directory.StartsWith($qaRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        [System.IO.Path]::GetFileName($directory) -notmatch '^[a-f0-9]{32}$' -or
        [System.IO.Path]::GetDirectoryName($directory) -ne $qaRoot) { throw 'test-directory-out-of-scope' }
  } elseif ($directory -ne $authorized) { throw 'destination-not-authorized' }
  Assert-NoReparse $directory
  if (-not $TestOnly) {
    $cursor = [System.IO.DirectoryInfo]::new($directory)
    while ($null -ne $cursor) {
      if (Test-Path -LiteralPath (Join-Path $cursor.FullName '.git')) { throw 'backup-directory-inside-git' }
      $cursor = $cursor.Parent
    }
  }
  $stage = 'permissions-directory'
  New-PrivateDirectory $directory $sid
  if ($Action -eq 'PrepareDirectory') {
    if ($InputFile -or $OutputName -or $ManifestFile) { throw 'prepare-takes-no-file-arguments' }
    [ordered]@{ status = 'private-directory-ready'; directory = $directory; keyCreated = $false } | ConvertTo-Json -Compress | Write-Output
    exit 0
  }
  $stage = 'permissions-lock'
  $lockPath = Join-Path $directory '.backup.lock'
  Assert-NoReparse $lockPath
  $lock = [System.IO.FileStream]::new($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  Assert-PrivateAcl $lockPath $sid
  $stage = 'key'
  $keyPath = Join-Path $directory 'backup-key.dpapi.json'
  if (-not (Test-Path -LiteralPath $keyPath)) {
    if ($Action -ne 'Encrypt' -or @(Get-ChildItem -LiteralPath $directory -File -Filter '*.mmbackup').Count -ne 0) { throw 'missing-existing-key' }
    $newKey = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    try {
      $protected = [System.Security.Cryptography.ProtectedData]::Protect($newKey, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
      $keyDocument = [ordered]@{ version = 1; keyId = [Guid]::NewGuid().ToString('D'); protectedKey = [Convert]::ToBase64String($protected) }
      Write-NewPrivateFile $keyPath $utf8.GetBytes(($keyDocument | ConvertTo-Json -Compress)) $sid
    } finally { [Array]::Clear($newKey, 0, $newKey.Length) }
  }
  $keyDocument = Read-PrivateJson $keyPath 16384 $sid
  if ($keyDocument.Count -ne 3 -or $keyDocument.version -ne 1 -or $keyDocument.keyId -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw 'key-document' }
  $keyBytes = [System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($keyDocument.protectedKey), $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  if ($keyBytes.Length -ne 32) { throw 'key-length' }
  # The one-argument constructor also supports PowerShell 7.2/.NET 6. Tag size
  # remains fixed at 16 bytes both when writing and before decryption.
  $aes = [System.Security.Cryptography.AesGcm]::new($keyBytes)
  if ($Action -eq 'Encrypt') {
    $stage = 'input'
    if ($InputFile) { throw 'plaintext-input-must-be-stdin' }
    $plainBytes = Read-InputBytes
    if ($plainBytes.Length -lt 5 -or [System.Text.Encoding]::ASCII.GetString($plainBytes, 0, 5) -ne 'PGDMP') { throw 'postgres-custom-dump-required' }
    $stage = 'manifest'
    if (-not $ManifestFile) { throw 'private-manifest-required' }
    $manifestPath = [System.IO.Path]::GetFullPath($ManifestFile)
    if ([System.IO.Path]::GetDirectoryName($manifestPath) -ne $directory -or
        [System.IO.Path]::GetFileName($manifestPath) -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{1,150}\.meta$') { throw 'manifest-path' }
    Assert-NoReparse $manifestPath
    Assert-PrivateAcl $manifestPath $sid
    $manifestInfo = Get-Item -LiteralPath $manifestPath
    if ($manifestInfo.PSIsContainer -or $manifestInfo.Length -lt 1 -or $manifestInfo.Length -gt 4096) { throw 'manifest-size' }
    $manifestBytes = [System.IO.File]::ReadAllBytes($manifestPath)
    $plainHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($plainBytes)).ToLowerInvariant()
    Assert-Manifest $manifestBytes $plainHash
    $envelope = [ordered]@{
      schema = $expectedSchema; algorithm = 'AES-256-GCM'; keyId = $keyDocument.keyId; database = $Database
      createdAt = [DateTimeOffset]::UtcNow.ToString('O')
      sha256 = $plainHash
      plainLength = [long]$plainBytes.Length
      manifestBase64 = [Convert]::ToBase64String($manifestBytes)
      manifestSha256 = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($manifestBytes)).ToLowerInvariant()
    }
    $stage = 'encrypt'
    $nonce = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
    $tag = [byte[]]::new(16)
    $ciphertext = [byte[]]::new($plainBytes.Length)
    $aes.Encrypt($nonce, $plainBytes, $ciphertext, $tag, (Get-Aad $envelope))
    $envelope['nonce'] = [Convert]::ToBase64String($nonce)
    $envelope['tag'] = [Convert]::ToBase64String($tag)
    $envelope['ciphertext'] = [Convert]::ToBase64String($ciphertext)
    if (-not $OutputName) { $OutputName = "$Database-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))-$([Guid]::NewGuid().ToString('N')).mmbackup" }
    if ($OutputName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{1,150}\.mmbackup$' -or [System.IO.Path]::GetFileName($OutputName) -ne $OutputName) { throw 'output-name' }
    $stage = 'output'
    $outputPath = Join-Path $directory $OutputName
    $bytes = $utf8.GetBytes(($envelope | ConvertTo-Json -Compress -Depth 4))
    Write-NewPrivateFile $outputPath $bytes $sid
    [ordered]@{ status = 'encrypted'; schema = $expectedSchema; database = $Database; file = $outputPath; sha256 = $envelope.sha256; plainLength = $envelope.plainLength; keyProtection = 'DPAPI-CurrentUser'; restoreVerified = $false } |
      ConvertTo-Json -Compress | Write-Output
  } else {
    $stage = 'encrypted-input'
    if (-not [Console]::IsOutputRedirected -or -not $InputFile -or $OutputName -or $ManifestFile) { throw 'redirected-binary-output-required' }
    $cipherPath = [System.IO.Path]::GetFullPath($InputFile)
    if ([System.IO.Path]::GetDirectoryName($cipherPath) -ne $directory -or [System.IO.Path]::GetFileName($cipherPath) -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{1,150}\.mmbackup$') { throw 'encrypted-input-out-of-scope' }
    $envelope = Read-PrivateJson $cipherPath ([long]($maxPlainBytes * 1.5 + 16384)) $sid
    if ($envelope.Count -ne 12 -or $envelope.schema -ne $expectedSchema -or $envelope.algorithm -ne 'AES-256-GCM' -or
        $envelope.keyId -ne $keyDocument.keyId -or $envelope.database -ne $Database -or
        $envelope.manifestSha256 -notmatch '^[a-f0-9]{64}$' -or $envelope.manifestBase64.Length -gt 5464 -or
        $envelope.sha256 -notmatch '^[a-f0-9]{64}$' -or ($envelope.plainLength -isnot [long] -and $envelope.plainLength -isnot [int]) -or
        $envelope.plainLength -lt 5 -or $envelope.plainLength -gt $maxPlainBytes) { throw 'envelope-metadata' }
    $created = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParseExact([string]$envelope.createdAt, 'O', [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None, [ref]$created)) { throw 'envelope-timestamp' }
    $nonce = [Convert]::FromBase64String($envelope.nonce)
    $tag = [Convert]::FromBase64String($envelope.tag)
    $ciphertext = [Convert]::FromBase64String($envelope.ciphertext)
    if ($nonce.Length -ne 12 -or $tag.Length -ne 16 -or $ciphertext.Length -ne $envelope.plainLength) { throw 'envelope-length' }
    $stage = 'authentication'
    $plainBytes = [byte[]]::new($ciphertext.Length)
    $aes.Decrypt($nonce, $ciphertext, $tag, $plainBytes, (Get-Aad $envelope))
    $stage = 'verification'
    $actual = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($plainBytes)).ToLowerInvariant()
    if ($actual -ne $envelope.sha256 -or [System.Text.Encoding]::ASCII.GetString($plainBytes, 0, 5) -ne 'PGDMP') { throw 'plain-integrity' }
    $manifestBytes = [Convert]::FromBase64String($envelope.manifestBase64)
    $manifestHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($manifestBytes)).ToLowerInvariant()
    if ($manifestHash -cne $envelope.manifestSha256) { throw 'manifest-integrity' }
    Assert-Manifest $manifestBytes $actual
    # No plaintext byte is emitted before tag, metadata, length and SHA verification.
    $stage = 'binary-output'
    $output = [Console]::OpenStandardOutput()
    $output.Write($plainBytes, 0, $plainBytes.Length)
    $output.Flush()
  }
} catch {
  [Console]::Error.WriteLine("Respaldo local no completado ($stage). No se imprimieron claves. Descartar cualquier salida binaria de un proceso fallido.")
  exit 1
} finally {
  if ($null -ne $aes) { $aes.Dispose() }
  if ($null -ne $lock) { $lock.Dispose() }
  if ($null -ne $keyBytes) { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
  if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
}
