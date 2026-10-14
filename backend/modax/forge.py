"""Original deterministic Godot project generator, not a learned world model."""

import json
import shutil
import tempfile
from pathlib import Path

from .workspace import ToolDenied, bounded_command

TEMPLATE = Path(__file__).resolve().parents[2] / "game_forge" / "templates" / "crystal-island"


def generate_game(title, seed=42):
    if not isinstance(seed, int) or not 0 <= seed <= 2147483647:
        raise ValueError("Seed must be an integer in 0..2147483647")
    title = title.strip()[:120]
    files = [{"path": p.name, "content": p.read_text()} for p in sorted(TEMPLATE.glob("*.gd"))]
    files.extend(
        [
            {
                "path": "project.godot",
                "content": f"""config_version=5
[application]
config/name={json.dumps(title)}
run/main_scene="res://world.tscn"
config/features=PackedStringArray("4.6", "GL Compatibility")
[display]
window/size/viewport_width=1152
window/size/viewport_height=648
window/stretch/mode="canvas_items"
window/handheld/orientation=0
[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
[textures]
default_filters/use_nearest_mipmap_filter=false
""",
            },
            {
                "path": "world.tscn",
                "content": f"""[gd_scene load_steps=2 format=3]
[ext_resource type="Script" path="res://world.gd" id="1_world"]
[node name="CrystalIsland" type="Node3D"]
script = ExtResource("1_world")
seed_value = {seed}
""",
            },
            {
                "path": "metadata.json",
                "content": json.dumps(
                    {
                        "title": title,
                        "seed": seed,
                        "generator": "procedural-template",
                        "template": "crystal-island-v1",
                        "license": "original-project-code; see repository LICENSE_POLICY",
                        "engine": "Godot 4.6",
                        "assets": "original procedural primitive meshes",
                    },
                    indent=2,
                ),
            },
            {
                "path": "export_presets.cfg",
                "content": """[preset.0]
name="Linux"
platform="Linux"
runnable=true
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="builds/crystal-island.x86_64"
[preset.0.options]
binary_format/architecture="x86_64"
[preset.1]
name="Android"
platform="Android"
runnable=true
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="builds/crystal-island.apk"
[preset.1.options]
package/unique_name="org.modax.crystalisland"
package/name="Crystal Island"
""",
            },
            {
                "path": "README.md",
                "content": "# Crystal Island\n\nOpen project.godot in Godot 4.6. Collect twelve crystals. WASD moves; Space jumps; click captures mouse, Escape releases it. Touch buttons move/jump; drag on right rotates camera. Left gamepad stick and A are supported. Save/Load preserve position and collectibles for this seed. Terrain and objects are deterministic procedural geometry. Mobile visual/performance/device testing remains required.\n\nRun `godot --headless --path . --import` then `godot --headless --path . --script smoke_test.gd`. Export presets need matching Godot templates and Android SDK/signing for APK. No build artifact is implied by presets.\n",
            },
        ]
    )
    return files


def validate_game(files, binary="godot", cancel_event=None):
    if binary == "managed":
        try:
            from .managed_godot import installed_godot

            binary = installed_godot()
        except (OSError, ValueError):
            return {
                "status": "unavailable",
                "reason": "Managed Godot download or checksum verification failed",
                "checks": [],
                "export": "not_attempted",
            }
    executable = shutil.which(binary)
    if not executable:
        return {
            "status": "unavailable",
            "reason": "Godot executable not installed",
            "checks": [],
            "export": "not_attempted",
        }
    checks = []
    options = {"cancel_event": cancel_event} if cancel_event is not None else {}
    version = None
    stage = "version"
    with tempfile.TemporaryDirectory(prefix="modax-godot-") as path:
        root = Path(path)
        for item in files:
            (root / item["path"]).write_text(item["content"])
        try:
            version = bounded_command([executable, "--version"], root, timeout=10, **options)[
                "output"
            ].strip()
            for stage, args in (
                ("import", ["--headless", "--verbose", "--path", path, "--import"]),
                ("gameplay", ["--headless", "--verbose", "--path", path, "--script", "smoke_test.gd"]),
            ):
                result = bounded_command([executable, *args], root, timeout=60, **options)
                result["stage"] = stage
                checks.append(result)
                if (
                    result["exit_code"] != 0
                    or "SCRIPT ERROR" in result["output"]
                    or "ERROR:" in result["output"]
                ):
                    return {
                        "status": "failed",
                        "engine": version,
                        "checks": checks,
                        "export": "not_attempted",
                    }
        except (ToolDenied, OSError) as exc:
            if hasattr(exc, "result"):
                checks.append({**exc.result, "stage": stage})
            return {
                "status": "failed",
                "reason": str(exc),
                "engine": version,
                "failed_stage": stage,
                "checks": checks,
                "export": "not_attempted",
            }
    return {"status": "passed", "engine": version, "checks": checks, "export": "not_attempted"}
