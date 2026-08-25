param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^(https://[^/]+|http://localhost(?::\d+)?)$')]
  [string]$PublicUrl,

  [switch]$ReuseBackendEnv
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $projectRoot '.env.deploy.example'
$targetPath = Join-Path $projectRoot '.env.deploy'

if (Test-Path -LiteralPath $targetPath) {
  throw '.env.deploy existe déjà. Il ne sera pas écrasé.'
}

function New-HexSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToHexString($bytes).ToLowerInvariant()
}

$content = Get-Content -LiteralPath $templatePath -Raw
$content = $content.Replace('https://mailmind.example.com', $PublicUrl)
$content = $content.Replace('genere-automatiquement', (New-HexSecret))
$content = $content.Replace('generee-automatiquement', (New-HexSecret))

if ($ReuseBackendEnv) {
  $backendEnvironmentPath = Join-Path $projectRoot 'backend/.env'
  if (-not (Test-Path -LiteralPath $backendEnvironmentPath)) {
    throw 'backend/.env est absent : impossible de réutiliser la configuration locale.'
  }

  $allowedKeys = @(
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AI_PROVIDER',
    'OLLAMA_MODEL',
    'OPENAI_API_KEY',
    'OPENAI_MODEL'
  )
  $existingValues = @{}
  foreach ($line in Get-Content -LiteralPath $backendEnvironmentPath) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$' -and $allowedKeys -contains $Matches[1]) {
      $existingValues[$Matches[1]] = $Matches[2]
    }
  }
  foreach ($key in $existingValues.Keys) {
    $content = [regex]::Replace($content, "(?m)^$key=.*$", "$key=$($existingValues[$key])")
  }
}

Set-Content -LiteralPath $targetPath -Value $content -Encoding utf8

Write-Host '.env.deploy a été créé. Ne partagez jamais ce fichier.'
