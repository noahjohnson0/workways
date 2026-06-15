# Godot 4.x co-op + dedicated-server gotchas

Hard-won lessons from shipping a 4-player co-op game on Godot 4.6 with a public
headless dedicated server (ENet + a Docker box). Each item below is something
that cost real debugging time, not generic engine advice. Link this from your
`CLAUDE.md` so your agent reads it before touching netcode, the export, or the
headless server.

## Netcode

- **Bump a `PROTOCOL_VERSION` whenever you add or remove an `@rpc` method on an
  always-present node** (your `Main` / autoload roots). The RPC config is a
  checksum over that node's RPC surface; change it and Godot rejects EVERY RPC
  from a peer whose checksum differs, with a bare `rpc node checksum failed`.
  Carry a version constant in the join handshake (e.g. bake it into the password
  as `"<password><unit-sep><version>"`) and drop mismatched peers at auth, so a
  stale client gets a clean "please update" instead of a silently half-broken
  session.
- **Call `set_multiplayer_authority(peer_id)` AFTER `add_child()`**, not before.
  Setting authority before the node is in the tree leads to RPC routing
  confusion. Same rule for any identity a node's `_ready()` branches on
  (`is_local`, `peer_id`): set it before `add_child`, because `_ready()` runs
  the instant the node enters the tree.
- **Use `@rpc("any_peer", "call_local", "reliable")` for shared state** (score,
  catches, penalties). `call_local` runs the handler on the sender too, so every
  peer applies the same delta exactly once. Without it the host and clients
  drift.
- **Distinguish "connected" from "ready to send."** A peer can exist while still
  CONNECTING (mid auto-reconnect). Gate RPC sends on a "session ready" check, not
  just "peer is active", or you spam `peer not connected` errors.
- **Authenticate at the handshake, before spawn.** Use
  `SceneMultiplayer.auth_callback` so an unauthenticated peer never reaches
  `peer_connected` and can never route a game RPC. A wrong password just times
  out; it never corrupts state. This also keeps opportunistic port scanners off
  a public host.
- **Split co-op-shared from local-progression state.** Only RPC the things all
  players must agree on (score, world events, achievements). Keep per-player
  inventory, cash, and XP purely local (persisted, never broadcast). Broadcasting
  everything is the easy way to a desync.
- **Late joiners need an explicit catch-up.** Have the newcomer send an "I'm
  here" RPC; the host replies with the full current state (roster, score, NPCs).
  Autoloads that receive sync RPCs should stash values that arrive before their
  own `_ready()` completes and apply them after, or an early snapshot races and
  is lost.

## Determinism (so peers don't ship the whole world over the wire)

- **Seed world generation from a constant and build it independently on every
  peer.** If `FishingWorld` is driven by a fixed `WORLD_SEED`, each client
  generates byte-identical terrain/props locally and you never replicate the
  mesh. No `randomize()` anywhere on that path. If you have multiple swappable
  worlds (a lake, a camp), make them implement the same method surface and the
  same seeding discipline so the rest of the code treats them identically.

## Export / Docker / dedicated server

- **Rebuild the class-name cache at build time.** Run
  `godot --headless --path . --import` before a headless first boot (and in your
  Dockerfile). Without it the server dies with "Identifier `<X>` not declared"
  for every `class_name` type, because `.godot/` is gitignored and the cache
  does not exist yet. Guard it with `|| true`, import warnings should not fail
  the build.
- **Headless Godot still links against the GUI libraries.** The Linux binary is
  dynamically linked against `libX11`, `libGL`, `libEGL`, `libfontconfig1`, etc.
  even though `--headless` opens no window. Install them in your image or the
  binary fails to start with a link error:
  ```dockerfile
  RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libfontconfig1 libx11-6 libxext6 libxcursor1 \
        libxinerama1 libxrandr2 libxi6 libgl1 libegl1 libglx0 \
      && rm -rf /var/lib/apt/lists/*
  ```
- **Persist `user://` across container rebuilds.** Mount a named Docker volume at
  the Godot userdata path
  (`/root/.local/share/godot/app_userdata/<Project Name>`) or the server loses
  its session/career state on every redeploy.
- **Export templates are not bundled.** They must be installed manually for your
  exact version (e.g. `~/.local/share/godot/export_templates/4.6.2.stable/`, or
  `%APPDATA%\Godot\...` on Windows). Missing templates fail with a non-obvious
  "No export template found at the expected path".
- **ENet is UDP.** Open the UDP port (a TCP firewall rule does nothing for it),
  and apply rate-limiting on the same port in the same pass, it is easy to open
  one and forget the other.
- **Gate background listeners on headless.** A status/health endpoint should only
  bind when `DisplayServer.get_name() == "headless"`. A human GUI host quietly
  opening a public port is surprising and usually unwanted.

## Headless lifecycle

- **`_is_headless()` is `DisplayServer.get_name() == "headless"`.** Branch on it
  early: the dedicated server has no window, no input, and no local player, but
  it still ticks the full simulation (clock, NPC AI, spawns). Skip UI (briefings,
  result dialogs, toasts) on headless, and replace the visual beats with logs
  plus deliberate delays so a watching party can follow along.
- **Autoloads that pump external SDKs need `process_mode = PROCESS_MODE_ALWAYS`.**
  Anything that must run while the tree is paused (a pause menu pauses the tree)
  has to opt out of pause, otherwise its callbacks stall.

## Rendering / performance

- **Use `HeightMapShape3D` for heightfield terrain, not a hand-built
  `ConcavePolygonShape3D`.** The concave shape can silently fail to register
  collisions; the heightmap collider is reliable and aligns 1:1 with the visual
  mesh.
- **Batch repeated props into `MultiMesh`.** Rocks, reeds, grass, stars: one
  `MultiMesh` is one draw call regardless of instance count, with per-instance
  transforms (and colors, if you enable them). This is how you push density
  without piling up draw calls.
- **Tune `lod_bias` on large meshes** (terrain especially) to stop LOD thrashing
  / flicker at distance.

## Verify before you trust a deploy

Open the project in the editor or run `godot --headless --path . --check-only`
(it should parse clean), boot the server with `--headless --quit-after 30`, and
do one local host/join smoke test, including a WRONG password, to confirm the
reject path actually rejects. For visual changes, the `godot-shots` skill in this
cluster captures a headless screenshot you can eyeball.
