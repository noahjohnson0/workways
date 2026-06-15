#!/usr/bin/env bash
# godot-shot.sh - boot a Godot project headless, run a --shot hook, collect PNGs.
# Scaffolded by `npx workways add godot`. Pairs with dev_shots.gd in this dir.
#
# Usage:
#   scripts/godot-shot/godot-shot.sh <shot-name> [project-dir] [out-dir]
#
# Env:
#   GODOT   path to a Godot 4.x binary. If unset, we probe PATH + common spots.
#
# What it does:
#   1. finds the Godot binary,
#   2. rebuilds the class-name cache (--headless --import) so a fresh checkout
#      doesn't die with "Identifier <X> not declared" for class_name types,
#   3. runs `godot --headless --path <proj> -- --shot <name>`,
#   4. copies the resulting _shot_<name>.png out of the project root into out-dir.

set -euo pipefail

SHOT="${1:?usage: godot-shot.sh <shot-name> [project-dir] [out-dir]}"
PROJ="${2:-.}"
OUT="${3:-./shots}"

find_godot() {
  if [[ -n "${GODOT:-}" && -x "${GODOT}" ]]; then echo "$GODOT"; return; fi
  for c in godot godot4 Godot; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return; fi
  done
  for p in \
    "$HOME"/.godot-validator/*[Gg]odot* \
    "/Applications/Godot.app/Contents/MacOS/Godot" \
    "$HOME/bin/godot"; do
    if [[ -x "$p" ]]; then echo "$p"; return; fi
  done
  echo "ERROR: no Godot binary found. Set GODOT=/path/to/godot." >&2
  exit 1
}

GODOT_BIN="$(find_godot)"
echo "[godot-shot] using $GODOT_BIN"

echo "[godot-shot] rebuilding class cache (--import)..."
"$GODOT_BIN" --headless --path "$PROJ" --import >/dev/null 2>&1 || true

echo "[godot-shot] capturing '$SHOT'..."
"$GODOT_BIN" --headless --path "$PROJ" -- --shot "$SHOT"

mkdir -p "$OUT"
shopt -s nullglob
copied=0
for png in "$PROJ"/_shot_"$SHOT"*.png "$PROJ"/_*"$SHOT"*.png; do
  cp "$png" "$OUT/"
  echo "[godot-shot] -> $OUT/$(basename "$png")"
  copied=$((copied + 1))
done
if [[ "$copied" -eq 0 ]]; then
  echo "WARNING: no PNG produced for '$SHOT'. Did you register it in dev_shots.gd?" >&2
  exit 1
fi
