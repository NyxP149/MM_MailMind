$ErrorActionPreference = 'Stop'

$mailMindRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $mailMindRoot

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
$bundledPnpm = 'C:\Users\sanyx\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'

Write-Host 'Demarrage de MailMind...' -ForegroundColor Cyan
Write-Host 'Gardez cette fenetre ouverte pendant utilisation.' -ForegroundColor Yellow
Write-Host 'Interface : http://localhost:5173' -ForegroundColor Green
Write-Host 'Arret : Ctrl+C' -ForegroundColor DarkGray
Write-Host ''

if ($pnpmCommand) {
  & $pnpmCommand.Source dev
} elseif (Test-Path -LiteralPath $bundledPnpm) {
  & $bundledPnpm dev
} else {
  npm run dev
}
