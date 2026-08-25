param(
  [ValidateSet('up', 'down', 'restart', 'logs', 'status', 'config')]
  [string]$Action = 'status'
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot '.env.deploy'

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw "Créez d’abord .env.deploy avec deploy/initialize-deployment.ps1."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop est introuvable. Installez-le puis rouvrez le terminal.'
}

Push-Location $projectRoot
try {
  switch ($Action) {
    'up' { docker compose --env-file .env.deploy up -d --build }
    'down' { docker compose --env-file .env.deploy down }
    'restart' { docker compose --env-file .env.deploy restart }
    'logs' { docker compose --env-file .env.deploy logs --tail 150 -f }
    'status' { docker compose --env-file .env.deploy ps }
    'config' { docker compose --env-file .env.deploy config --quiet }
  }
} finally {
  Pop-Location
}
