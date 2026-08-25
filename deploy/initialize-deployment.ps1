param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://[^/]+$')]
  [string]$PublicUrl
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
Set-Content -LiteralPath $targetPath -Value $content -Encoding utf8

Write-Host '.env.deploy a été créé. Complétez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sans partager le fichier.'
