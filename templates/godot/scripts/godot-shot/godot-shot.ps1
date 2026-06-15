#!/usr/bin/env pwsh
# godot-shot.ps1 - Windows / PowerShell twin of godot-shot.sh.
# Scaffolded by `npx workways add godot`. Pairs with dev_shots.gd in this dir.
#
# Usage:
#   scripts/godot-shot/godot-shot.ps1 <shot-name> [project-dir] [out-dir]
#
# Env:
#   $env:GODOT  path to a Godot 4.x exe. If unset, probes PATH + common spots.
param(
  [Parameter(Mandatory = $true)][string]$Shot,
  [string]$ProjectDir = ".",
  [string]$OutDir = "./shots"
)
$ErrorActionPreference = "Stop"

function Find-Godot {
  if ($env:GODOT -and (Test-Path $env:GODOT)) { return $env:GODOT }
  $onPath = Get-Command godot, godot4 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($onPath) { return $onPath.Source }
  $cands = @(
    "$env:USERPROFILE\.godot-validator\*odot*console.exe",
    "$env:USERPROFILE\.godot-validator\*odot*.exe",
    "$env:LOCALAPPDATA\Programs\Godot\*odot*.exe"
  )
  foreach ($c in $cands) {
    $hit = Get-ChildItem $c -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  throw "no Godot binary found. Set `$env:GODOT to the Godot 4.x exe."
}

$godot = Find-Godot
Write-Host "[godot-shot] using $godot"

# Rebuild the class-name cache so a fresh checkout doesn't die with
# "Identifier not declared" for class_name types. Non-fatal if it warns.
Write-Host "[godot-shot] rebuilding class cache (--import)..."
try { & $godot --headless --path $ProjectDir --import *> $null } catch {}

Write-Host "[godot-shot] capturing '$Shot'..."
& $godot --headless --path $ProjectDir -- --shot $Shot

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$pngs = Get-ChildItem -Path $ProjectDir -Filter "_*$Shot*.png" -ErrorAction SilentlyContinue
if (-not $pngs) {
  Write-Error "no PNG produced for '$Shot'. Did you register it in dev_shots.gd?"
}
foreach ($p in $pngs) {
  Copy-Item $p.FullName -Destination $OutDir -Force
  Write-Host "[godot-shot] -> $OutDir/$($p.Name)"
}
