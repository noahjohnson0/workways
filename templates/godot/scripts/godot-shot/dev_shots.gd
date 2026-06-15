# dev_shots.gd - headless screenshot verification for Godot 4.x
# Scaffolded by `npx workways add godot`. Register as an autoload named DevShots
# (Project > Project Settings > Autoload), or instantiate it from your main
# scene's _ready().
#
# Why this exists: an AI coding agent (or CI) can VERIFY a visual change by
# booting the game headless, capturing the viewport to a PNG, and reading it
# back. Godot's --headless mode uses a dummy DisplayServer (no window) but still
# renders internally, so viewport capture works even where an OS screen-grab is
# blocked (CI, a VM, a remote shell).
#
# Run it (note the bare `--`, which splits engine args from user args):
#   godot --headless --path . -- --shot <name>
# The wrapper scripts/godot-shot/godot-shot.sh (or .ps1) does the binary
# discovery, class-cache rebuild, and PNG collection for you.

extends Node

# Where captures land. res:// is the project root; the wrapper copies them out.
const OUT_DIR := "res://"

# name -> Callable(host). Each setup runs on a fresh boot, gets the current
# scene as `host`, arranges what you want to see, and returns. Keep setups
# deterministic (no randomize()) so a shot is byte-comparable across runs.
var _shots := {}

func _ready() -> void:
	var shot_name := _requested_shot()
	if shot_name == "":
		return  # normal boot, not a shot run; stay out of the way
	_register_shots()
	if not _shots.has(shot_name):
		push_error("[dev-shots] unknown shot '%s'. Known: %s"
			% [shot_name, ", ".join(_shots.keys())])
		get_tree().quit(2)
		return
	# Defer so the main scene finishes its own _ready before we touch it.
	call_deferred("_run_shot", shot_name)

func _requested_shot() -> String:
	# get_cmdline_user_args() is everything after the bare `--`, so engine flags
	# never collide with ours.
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--shot" and i + 1 < args.size():
			return args[i + 1]
	return ""

# Register your shots here. Two examples ship; replace them with real scenes.
func _register_shots() -> void:
	# Capture the current scene as-is once it settles.
	_shots["boot"] = func(_host): pass
	# A worked example: re-theme the world to dusk before the shot. Adapt the
	# node path / property to your project.
	#   _shots["dusk"] = func(host):
	#       host.get_node("World").time_of_day = 0.85

# The atomic capture unit. All three steps matter:
#   1. let the scene SETTLE (N process frames) so global illumination, fog, and
#      shadow cascades finish computing; a single frame leaves visible artifacts,
#   2. await RenderingServer.frame_post_draw so the GPU work for THIS frame is
#      finished before we read the framebuffer,
#   3. read the viewport texture into an Image and save_png.
# Bump settle_frames (200+) for SDFGI / volumetric fog that take a while to bounce.
func capture(file_name: String, settle_frames: int = 30) -> void:
	for _i in settle_frames:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := OUT_DIR.path_join(file_name)
	var err := img.save_png(path)
	if err != OK:
		push_error("[dev-shots] save_png failed (%d): %s" % [err, path])
	else:
		print("[dev-shots] wrote %s" % path)

func _run_shot(shot_name: String) -> void:
	await get_tree().create_timer(0.4).timeout  # let autoloads/world spin up
	var setup: Callable = _shots[shot_name]
	setup.call(get_tree().current_scene)
	await capture("_shot_%s.png" % shot_name)
	get_tree().quit()
