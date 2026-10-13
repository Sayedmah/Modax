import io
import json
import os
import zipfile

from modax.forge import generate_game, validate_game
from test_chat import register


def test_seeded_game_is_reproducible():
    a = generate_game('Island "Omega"', 42)
    assert a == generate_game('Island "Omega"', 42)
    assert a != generate_game('Island "Omega"', 43)
    files = {x["path"]: x["content"] for x in a}
    assert {
        "project.godot",
        "world.tscn",
        "world.gd",
        "player.gd",
        "hud.gd",
        "smoke_test.gd",
        "export_presets.cfg",
    } <= files.keys()
    assert 'run/main_scene="res://world.tscn"' in files["project.godot"]
    assert json.loads(files["metadata.json"])["seed"] == 42


def test_missing_engine_is_honest():
    result = validate_game(generate_game("Island", 42), "not-a-real-godot-executable")
    assert result["status"] == "unavailable"
    assert result["export"] == "not_attempted"


def test_game_api_preserves_files_when_engine_missing(client):
    h = register(client)
    task = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "game", "goal": "Fantasy island"}
    ).json()
    result = client.post(f"/api/v1/tasks/{task['id']}/run", headers=h, json={"seed": 15}).json()
    assert result["state"] in {"COMPLETED", "BLOCKED"}
    archive = client.get(f"/api/v1/tasks/{task['id']}/download", headers=h)
    with zipfile.ZipFile(io.BytesIO(archive.content)) as z:
        assert "player.gd" in z.namelist()
        assert json.loads(z.read("metadata.json"))["seed"] == 15


def test_actual_godot_gameplay():
    engine = os.getenv("MODAX_TEST_GODOT")
    if not engine:
        import pytest

        pytest.skip("Set MODAX_TEST_GODOT to run genuine engine checks")
    result = validate_game(generate_game("Verified island", 73), engine)
    assert result["status"] == "passed", result
    assert "GAMEPLAY_CHECKS_PASSED" in result["checks"][1]["output"]
