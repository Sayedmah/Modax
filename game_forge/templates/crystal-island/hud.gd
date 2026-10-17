extends CanvasLayer

var score: Label
var status: Label

func _ready() -> void:
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	score = Label.new()
	score.position = Vector2(22, 16)
	score.add_theme_font_size_override("font_size", 24)
	root.add_child(score)
	status = Label.new()
	status.position = Vector2(22, 54)
	status.text = "Collect 12 crystals • WASD / touch • drag right to look"
	root.add_child(status)
	var save := Button.new()
	save.text = "Save"
	save.position = Vector2(22, 88)
	save.size = Vector2(90, 44)
	save.pressed.connect(func(): status.text = "Saved" if get_parent().save_state() else "Save failed")
	root.add_child(save)
	var load_button := Button.new()
	load_button.text = "Load"
	load_button.position = Vector2(122, 88)
	load_button.size = Vector2(90, 44)
	load_button.pressed.connect(func(): status.text = "Loaded" if get_parent().load_state() else "No compatible save")
	root.add_child(load_button)
	var positions := {"move_left": Vector2(24, -100), "move_forward": Vector2(102, -178), "move_back": Vector2(102, -100), "move_right": Vector2(180, -100), "jump": Vector2(-108, -100)}
	var labels := {"move_left": "←", "move_forward": "↑", "move_back": "↓", "move_right": "→", "jump": "Jump"}
	for action: String in positions:
		var button := Button.new()
		button.text = labels[action]
		button.size = Vector2(70, 70)
		button.anchor_top = 1
		button.anchor_bottom = 1
		if action == "jump":
			button.anchor_left = 1
			button.anchor_right = 1
		button.position = positions[action]
		button.button_down.connect(press.bind(action))
		button.button_up.connect(release.bind(action))
		root.add_child(button)

func press(action: String) -> void:
	Input.action_press(action)

func release(action: String) -> void:
	Input.action_release(action)

func update_score(value: int, total: int) -> void:
	score.text = "Crystals %d / %d" % [value, total]
	if value == total:
		status.text = "Island mastered! Save your progress."
