extends Node3D

@export var seed_value: int = 42
var player: CharacterBody3D
var crystal_nodes: Array[MeshInstance3D] = []
var collected: Array[int] = []
var hud: CanvasLayer
var save_path: String = "user://modax-island-save.json"
var terrain: MeshInstance3D
const PlayerScript = preload("res://player.gd")
const HudScript = preload("res://hud.gd")

func _ready() -> void:
	install_input()
	build_environment()
	build_terrain()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	for i in range(45):
		var x := rng.randf_range(-23.0, 23.0)
		var z := rng.randf_range(-23.0, 23.0)
		if Vector2(x, z).length() < 5.0:
			continue
		var root := Node3D.new()
		root.position = Vector3(x, height_at(x, z), z)
		add_child(root)
		var trunk := CylinderMesh.new()
		trunk.top_radius = 0.18
		trunk.bottom_radius = 0.28
		trunk.height = 2.0
		add_mesh(root, trunk, Vector3(0, 1, 0), Color(0.3, 0.18, 0.1))
		var crown := SphereMesh.new()
		crown.radius = 1.2
		crown.height = 2.4
		add_mesh(root, crown, Vector3(0, 2.4, 0), Color(0.08, 0.42, 0.25))
	for i in range(12):
		var angle := float(i) / 12.0 * TAU
		var radius := rng.randf_range(8.0, 19.0)
		var pos := Vector3(cos(angle) * radius, 0, sin(angle) * radius)
		pos.y = height_at(pos.x, pos.z) + 1.0
		var crystal := SphereMesh.new()
		crystal.radius = 0.35
		crystal.height = 0.7
		var node := add_mesh(self, crystal, pos, Color(0.6, 0.35, 1.0))
		crystal_nodes.append(node)
	player = PlayerScript.new()
	player.position = Vector3(0, height_at(0, 0) + 2.0, 0)
	add_child(player)
	hud = HudScript.new()
	add_child(hud)
	hud.update_score(collected.size(), crystal_nodes.size())

func install_input() -> void:
	var keys := {"move_forward": KEY_W, "move_back": KEY_S, "move_left": KEY_A, "move_right": KEY_D, "jump": KEY_SPACE}
	var buttons := {"jump": JOY_BUTTON_A}
	for action: String in keys:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		var key := InputEventKey.new()
		key.physical_keycode = keys[action]
		InputMap.action_add_event(action, key)
	for action: String in buttons:
		var button := InputEventJoypadButton.new()
		button.button_index = buttons[action]
		InputMap.action_add_event(action, button)
	var axes := {"move_left": Vector2(JOY_AXIS_LEFT_X, -1), "move_right": Vector2(JOY_AXIS_LEFT_X, 1), "move_forward": Vector2(JOY_AXIS_LEFT_Y, -1), "move_back": Vector2(JOY_AXIS_LEFT_Y, 1)}
	for action: String in axes:
		var motion := InputEventJoypadMotion.new()
		motion.axis = int(axes[action].x)
		motion.axis_value = axes[action].y
		InputMap.action_add_event(action, motion)

func height_at(x: float, z: float) -> float:
	return 1.0 + sin(x * 0.12 + float(seed_value % 100) * 0.03) * cos(z * 0.12) * 1.8

func build_terrain() -> void:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for x in range(-28, 28):
		for z in range(-28, 28):
			var a := Vector3(x, height_at(x, z), z)
			var b := Vector3(x + 1, height_at(x + 1, z), z)
			var c := Vector3(x, height_at(x, z + 1), z + 1)
			var d := Vector3(x + 1, height_at(x + 1, z + 1), z + 1)
			for vertex: Vector3 in [a, b, c, b, d, c]:
				surface.set_color(Color(0.14, 0.36 + (vertex.y + 1) * 0.025, 0.24))
				surface.add_vertex(vertex)
	surface.generate_normals()
	terrain = MeshInstance3D.new()
	terrain.name = "Terrain"
	terrain.mesh = surface.commit()
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	terrain.material_override = material
	add_child(terrain)
	terrain.create_trimesh_collision()
	var water := PlaneMesh.new()
	water.size = Vector2(160, 160)
	add_mesh(self, water, Vector3(0, -1.8, 0), Color(0.06, 0.3, 0.52))

func build_environment() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -25, 0)
	sun.light_energy = 1.2
	sun.shadow_enabled = true
	add_child(sun)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	environment.environment.sky = sky
	environment.environment.background_mode = Environment.BG_SKY
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	add_child(environment)

func add_mesh(parent: Node, mesh: Mesh, pos: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.position = pos
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	node.material_override = material
	parent.add_child(node)
	return node

func _physics_process(delta: float) -> void:
	if not is_instance_valid(player):
		return
	for i in range(crystal_nodes.size()):
		if collected.has(i):
			continue
		crystal_nodes[i].rotate_y(delta)
		if player.position.distance_to(crystal_nodes[i].position) < 1.6:
			collect(i)

func collect(index: int) -> void:
	if index < 0 or index >= crystal_nodes.size() or collected.has(index):
		return
	collected.append(index)
	crystal_nodes[index].visible = false
	if is_instance_valid(hud):
		hud.update_score(collected.size(), crystal_nodes.size())

func save_state() -> bool:
	var file := FileAccess.open(save_path, FileAccess.WRITE)
	if file == null:
		return false
	var pos := player.position
	file.store_string(JSON.stringify({"version": 1, "seed": seed_value, "position": [pos.x, pos.y, pos.z], "collected": collected}))
	return true

func load_state() -> bool:
	if not FileAccess.file_exists(save_path):
		return false
	var file := FileAccess.open(save_path, FileAccess.READ)
	var data = JSON.parse_string(file.get_as_text())
	if not data is Dictionary or data.get("seed") != seed_value or not data.get("position") is Array or data["position"].size() != 3:
		return false
	var pos: Array = data["position"]
	for value in pos:
		if not (value is float or value is int) or not is_finite(float(value)) or absf(float(value)) > 200:
			return false
	if not data.get("collected") is Array:
		return false
	collected.clear()
	for crystal in crystal_nodes:
		crystal.visible = true
	for value in data["collected"]:
		if value is float or value is int:
			collect(int(value))
	player.position = Vector3(pos[0], pos[1], pos[2])
	player.velocity = Vector3.ZERO
	hud.update_score(collected.size(), crystal_nodes.size())
	return true
