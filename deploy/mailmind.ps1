param(
  [ValidateSet('up', 'down', 'restart', 'logs', 'status', 'config')]
  [string]$Action = 'status'
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot '.env.deploy'

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw "Créez d’abord .env.deploy avec deploy/initialize-deployment.ps1."
}
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCommand) {
  $docker = $dockerCommand.Source
} else {
  $localDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
  $systemDocker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
  if (Test-Path -LiteralPath $localDocker) { $docker = $localDocker }
  elseif (Test-Path -LiteralPath $systemDocker) { $docker = $systemDocker }
}
if (-not $docker) {
  throw 'Docker Desktop est introuvable. Installez-le puis rouvrez le terminal.'
}

Push-Location $projectRoot
try {
  switch ($Action) {
    'up' { & $docker compose --env-file .env.deploy up -d --build }
    'down' { & $docker compose --env-file .env.deploy down }
    'restart' { & $docker compose --env-file .env.deploy restart }
    'logs' { & $docker compose --env-file .env.deploy logs --tail 150 -f }
    'status' { & $docker compose --env-file .env.deploy ps }
    'config' { & $docker compose --env-file .env.deploy config --quiet }
  }
} finally {
  Pop-Location
}
