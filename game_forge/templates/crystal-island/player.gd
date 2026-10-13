extends CharacterBody3D

var speed: float = 6.0
var gravity: float = 20.0
var camera: Camera3D
var pivot: Node3D

func _ready() -> void:
	name = "Player"
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.4
	capsule.height = 1.8
	shape.shape = capsule
	shape.position.y = 0.9
	add_child(shape)
	var body := MeshInstance3D.new()
	var mesh := CapsuleMesh.new()
	mesh.radius = 0.4
	mesh.height = 1.8
	body.mesh = mesh
	body.position.y = 0.9
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.3, 0.55, 1.0)
	body.material_override = material
	add_child(body)
	pivot = Node3D.new()
	pivot.position.y = 1.5
	add_child(pivot)
	var arm := SpringArm3D.new()
	arm.spring_length = 5.0
	arm.rotation.x = -0.2
	arm.add_excluded_object(get_rid())
	pivot.add_child(arm)
	camera = Camera3D.new()
	camera.current = true
	camera.fov = 70
	arm.add_child(camera)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if event is InputEventKey and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		look(event.relative)
	if event is InputEventScreenDrag and event.position.x > get_viewport().get_visible_rect().size.x * 0.48:
		look(event.relative)

func look(relative: Vector2) -> void:
	rotate_y(-relative.x * 0.004)
	pivot.rotation.x = clampf(pivot.rotation.x - relative.y * 0.004, -0.9, 0.65)

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = 8.0
	var axis := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := (transform.basis * Vector3(axis.x, 0, axis.y)).normalized()
	velocity.x = direction.x * speed
	velocity.z = direction.z * speed
	move_and_slide()
	if position.y < -12.0:
		position = Vector3(0, 8, 0)
		velocity = Vector3.ZERO
