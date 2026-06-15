# godot-shot

Headless viewport-capture for Godot 4.x. Boot the game with no window, render a
known scene, and save a PNG you (or an AI agent, or CI) can look at.

## Files

| Path | Role |
| --- | --- |
| `dev_shots.gd` | Autoload that parses `--shot <name>`, runs your registered scene setup, and does the settle + `frame_post_draw` + `save_png` capture. |
| `godot-shot.sh` | bash wrapper: find the binary, rebuild the class cache, run the shot, copy PNGs to `./shots/`. |
| `godot-shot.ps1` | PowerShell twin of the above for Windows. |

## Wire-up

1. Add `dev_shots.gd` as an autoload named `DevShots`.
2. Register shots in `_register_shots()` (a `name -> Callable(host)` map).
3. Run `./godot-shot.sh <name>` (or `.ps1`) and read the PNG in `./shots/`.

Set `GODOT` (`$env:GODOT` on Windows) to point at your Godot 4.x binary if it is
not on `PATH` or in a probed location.

See `.claude/skills/godot-shots/SKILL.md` for the why and the agent workflow,
and `docs/methods/godot-coop.md` for the surrounding Godot co-op gotchas.
