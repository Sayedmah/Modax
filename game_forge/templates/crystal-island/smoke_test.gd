extends SceneTree

var failures: int = 0

func check(condition: bool, description: String) -> void:
	if not condition:
		push_error(description)
		failures += 1

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var world = load("res://world.tscn").instantiate()
	root.add_child(world)
	world.save_path = "user://modax-smoke-save.json"
	for i in range(160):
		await physics_frame
	check(world.player.is_on_floor(), "Player must land on terrain collision")
	check(world.player.camera.current, "Active third-person camera")
	check(world.crystal_nodes.size() == 12, "All collectibles generated")
	var start: Vector3 = world.player.position
	Input.action_press("move_forward")
	for i in range(40):
		await physics_frame
	Input.action_release("move_forward")
	check(world.player.position.z < start.z - 1.0, "Forward movement must work")
	for i in range(20):
		await physics_frame
	var before_jump: float = world.player.position.y
	Input.action_press("jump")
	await physics_frame
	Input.action_release("jump")
	for i in range(8):
		await physics_frame
	check(world.player.position.y > before_jump + 0.3, "Jump input must work")
	world.hud.press("move_right")
	check(Input.is_action_pressed("move_right"), "Touch control action press")
	world.hud.release("move_right")
	check(not Input.is_action_pressed("move_right"), "Touch control action release")
	world.player.look(Vector2(30, 10))
	check(absf(world.player.rotation.y) > 0.01, "Camera look must rotate")
	world.collect(0)
	check(not world.crystal_nodes[0].visible, "Collected crystal hidden")
	var saved_position: Vector3 = world.player.position
	check(world.save_state(), "Save succeeds")
	world.player.position = Vector3(20, 8, 20)
	world.collected.clear()
	check(world.load_state(), "Load succeeds")
	check(world.collected.has(0), "Collected objects persist")
	check(world.player.position.distance_to(saved_position) < 0.01, "Position persists")
	if FileAccess.file_exists(world.save_path):
		DirAccess.remove_absolute(world.save_path)
	world.queue_free()
	await process_frame
	if failures == 0:
		print("GAMEPLAY_CHECKS_PASSED: collision movement jump camera touch collect save load")
	quit(1 if failures > 0 else 0)
