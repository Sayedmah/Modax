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


def test_managed_primitive_game_skips_editor_but_runs_gameplay(monkeypatch):
    from modax import forge, managed_godot

    monkeypatch.setattr(managed_godot, "installed_godot", lambda: "/fixed/godot")
    monkeypatch.setattr(forge.shutil, "which", lambda _: "/fixed/godot")
    calls = []

    def command(args, root, timeout):
        calls.append(args)
        return {
            "exit_code": 0,
            "output": "4.6" if "--version" in args else "GAMEPLAY_CHECKS_PASSED",
        }

    monkeypatch.setattr(forge, "bounded_command", command)
    result = validate_game(generate_game("Island", 73), "managed")
    assert result["status"] == "passed"
    assert result["import"] == "not_required_for_trusted_primitive_template"
    assert any("smoke_test.gd" in args for args in calls)
    assert not any("--import" in args for args in calls)


def test_managed_runtime_rejects_modified_template(monkeypatch):
    from modax import managed_godot

    def unexpected_download():
        raise AssertionError("Modified template must be rejected before acquiring engine")

    monkeypatch.setattr(managed_godot, "installed_godot", unexpected_download)
    files = generate_game("Island")
    files[0]["content"] += "\n# arbitrary modification"
    result = validate_game(files, "managed")
    assert result["status"] == "unavailable"


def test_no_gameplay_success_without_completion_marker(monkeypatch):
    from modax import forge

    monkeypatch.setattr(forge.shutil, "which", lambda _: "/fixed/godot")
    monkeypatch.setattr(
        forge, "bounded_command", lambda *args, **kwargs: {"exit_code": 0, "output": "4.6"}
    )
    result = validate_game(generate_game("Island"))
    assert result["status"] == "failed"
    assert result["failed_stage"] == "gameplay"
