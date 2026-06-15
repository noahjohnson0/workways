---
name: godot-shots
description: >-
  See a Godot visual change instead of guessing at it. Boots the game headless,
  captures the viewport to a PNG, and reads it back, so an agent can verify a
  model/scene/shader/UI change without a human at the screen. Use when a change
  affects what the game LOOKS like (a mesh, material, light, camera, UI layout,
  sky, post-processing) and you want proof it rendered. NOT for pure logic or
  netcode changes, run the test suite for those.
---

# godot-shots

Godot's `--headless` mode runs with a dummy `DisplayServer` (no window), but it
still renders the scene internally. That means you can capture the viewport to a
PNG from a headless boot and look at it, even on CI, in a VM, or over a remote
shell where an OS screen-grab is blocked. This skill turns "I think the change
looks right" into "here is the pixel that proves it."

## The capture pattern (why it is shaped this way)

A screenshot is only trustworthy if the frame finished rendering. The capture in
`scripts/godot-shot/dev_shots.gd` does three things in order, and all three
matter:

1. **Settle** - `await get_tree().process_frame` for N frames so global
   illumination (SDFGI), volumetric fog, and shadow cascades finish computing.
   One frame is not enough; you get half-lit artifacts. Bump to 200+ frames for
   GI-heavy scenes.
2. **Sync to the GPU** - `await RenderingServer.frame_post_draw` so the draw for
   THIS frame is actually done before you read the framebuffer.
3. **Read + write** - `get_viewport().get_texture().get_image().save_png(path)`.

Skip any one of them and you get a black, partial, or stale image.

## Setup (once per project)

1. Add `scripts/godot-shot/dev_shots.gd` as an autoload named `DevShots`
   (Project > Project Settings > Autoload), or instantiate it from your main
   scene's `_ready()`.
2. Register the shots you care about in `_register_shots()`. A shot is a
   `name -> Callable(host)` that arranges the scene and returns; the framework
   captures and quits for you. Keep setups deterministic (no `randomize()`) so a
   shot is comparable run to run.

## Taking a shot

```bash
# <shot-name> matches a key you registered in dev_shots.gd
scripts/godot-shot/godot-shot.sh dusk            # bash / macOS / Linux
scripts/godot-shot/godot-shot.ps1 dusk           # Windows / PowerShell
```

The wrapper finds the Godot binary (set `GODOT` / `$env:GODOT` to override),
rebuilds the class-name cache first (`--headless --import`, otherwise a fresh
checkout dies with "Identifier not declared"), runs the shot, and copies the
PNG into `./shots/`. Then `Read` the PNG to verify the change.

Under the hood it is just:

```bash
godot --headless --path . -- --shot dusk
```

The bare `--` matters: everything after it is read by `OS.get_cmdline_user_args()`
inside the game, so your flags never collide with engine flags.

## Honest limits

- This proves the change **rendered as expected**. It does not test input,
  physics-over-time, or networking, use the game's own test suite for those.
- A shot is a single frame. For animation, capture a few frames at known
  timestamps rather than expecting motion in one PNG.
- Headless still loads the rendering driver, so on Linux servers the Godot
  binary needs `libGL` / `libX11` etc. present (see the `godot-coop` method doc
  for the Docker apt list).
