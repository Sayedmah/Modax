import json

import pytest
from modax.config import Settings
from modax.providers import Registry
from modax.store import Store, uid
from modax.tasks import InvalidTransition, TaskEngine
from modax.workspace import ToolDenied, Workspace
from test_chat import register


def test_safe_edits_and_rollback(tmp_path):
    w = Workspace(tmp_path / "project")
    snapshot = w.apply([{"path": "src/main.py", "content": "x = 1\n"}])
    assert w.read("src/main.py") == "x = 1\n"
    w.apply([{"path": "src/main.py", "content": "x = 2\n"}])
    assert w.read("src/main.py") == "x = 2\n"
    w.rollback(snapshot)
    assert not (w.root / "src/main.py").exists()


@pytest.mark.parametrize(
    "path",
    [
        "../escape.py",
        "/tmp/evil.py",
        ".env",
        ".git/config",
        "a/../../escape.py",
        "C:\\escape.py",
        "file.exe",
        "a/.ssh/key.txt",
    ],
)
def test_denied_paths(tmp_path, path):
    with pytest.raises(ToolDenied):
        Workspace(tmp_path / "project").apply([{"path": path, "content": "x=1"}])


def test_symlink_and_atomic_validation(tmp_path):
    w = Workspace(tmp_path / "project")
    external = tmp_path / "outside"
    external.mkdir()
    (w.root / "link").symlink_to(external, target_is_directory=True)
    with pytest.raises(ToolDenied):
        w.apply([{"path": "link/x.py", "content": "x=1"}])
    (w.root / "link").unlink()
    with pytest.raises(ToolDenied):
        w.apply([{"path": "valid.py", "content": "x=1"}, {"path": "invalid.py", "content": "if ("}])
    assert not (w.root / "valid.py").exists()


def test_runtime_execution_is_disabled_by_default(tmp_path):
    w = Workspace(tmp_path / "project")
    with pytest.raises(ToolDenied):
        w.run_tests(enabled=False)


def test_task_state_and_restart(tmp_path):
    store = Store(tmp_path / "db.sqlite3")
    user = uid()
    store.execute("INSERT INTO users VALUES(?,?,?)", (user, "alice", "unused"))
    engine = TaskEngine(store, Settings(data_dir=tmp_path), Registry(Settings(data_dir=tmp_path)))
    task = engine.create(user, "Build Python code", "code", "SMART")
    assert task["state"] == "READY"
    assert len(json.loads(task["plan"])) >= 3
    with pytest.raises(InvalidTransition):
        engine.transition(user, task["id"], "COMPLETED")
    engine.transition(user, task["id"], "RUNNING")
    store.recover()
    assert store.require("tasks", user, task["id"])["state"] == "BLOCKED"
    engine.transition(user, task["id"], "READY")
    assert store.require("tasks", user, task["id"])["state"] == "READY"


def test_code_workflow_and_memory_isolation(client):
    h = register(client)
    r = client.post(
        "/api/v1/tasks", headers=h, json={"goal": "Create a Python greeting", "kind": "code"}
    )
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    r = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={"model": "demo"})
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "COMPLETED"
    result = json.loads(r.json()["result"])
    assert result["syntax_checked"] is True
    assert result["runtime_tests"] == "not_requested"
    assert "hello.py" in result["files"]
    assert client.get(f"/api/v1/tasks/{tid}/files/hello.py", headers=h).text.startswith("def greet")
    assert client.get(f"/api/v1/tasks/{tid}/download", headers=h).status_code == 200
    other = register(client, "bob")
    assert client.post(f"/api/v1/tasks/{tid}/run", headers=other, json={}).status_code == 404
    assert client.get(f"/api/v1/tasks/{tid}/files/hello.py", headers=other).status_code == 404
    mid = client.post("/api/v1/memory", headers=h, json={"content": "Prefer Arabic"}).json()["id"]
    assert len(client.get("/api/v1/memory", headers=h).json()) == 1
    assert client.get("/api/v1/memory", headers=other).json() == []
    assert client.delete(f"/api/v1/memory/{mid}", headers=other).status_code == 404
    assert client.delete(f"/api/v1/memory/{mid}", headers=h).status_code == 204


def test_memory_rejects_secrets(client):
    h = register(client)
    assert (
        client.post(
            "/api/v1/memory", headers=h, json={"content": "api_key=some-secret-value"}
        ).status_code
        == 422
    )


def test_file_count_limit_rejects_before_poisoning_rollback(tmp_path):
    w = Workspace(tmp_path / "project")
    for batch in range(8):
        w.apply([{"path": f"file-{batch}-{i}.txt", "content": "x"} for i in range(32)])
    with pytest.raises(ToolDenied):
        w.apply([{"path": "too-many.txt", "content": "x"}])
    assert len(w.files()) == 256


def test_invalid_json_shape_does_not_leave_task_running(client):
    from modax.providers import DemoProvider

    class BadProvider(DemoProvider):
        async def stream_text(self, messages):
            yield "[]"

    client.app.state.registry.providers["demo"] = BadProvider()
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write Python"}
    ).json()["id"]
    r = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={})
    assert r.status_code == 200
    assert r.json()["state"] == "BLOCKED"


def test_rollback_can_recover_legacy_oversized_workspace(tmp_path):
    w = Workspace(tmp_path / "project")
    snapshot = w.apply([{"path": "original.txt", "content": "x"}])
    for i in range(257):
        (w.root / f"legacy-{i}.txt").write_text("x")
    w.rollback(snapshot)
    assert w.files() == []


def test_docker_staging_permissions_and_immutable_image(tmp_path, monkeypatch):
    import modax.workspace as module

    w = Workspace(tmp_path / "project")
    w.apply([{"path": "hello.py", "content": "x=1"}])
    digest = "python@sha256:" + "a" * 64
    monkeypatch.setattr(module.shutil, "which", lambda command: "/usr/bin/docker")

    def check_command(args, cwd, timeout):
        assert cwd.stat().st_mode & 0o777 == 0o755
        assert (cwd / "hello.py").stat().st_mode & 0o777 == 0o644
        assert "--network=none" in args and "--read-only" in args and digest in args
        assert str(w.root) not in args[args.index("--mount") + 1]
        return {"exit_code": 0, "output": "synthetic transport result"}

    monkeypatch.setattr(module, "bounded_command", check_command)
    monkeypatch.setattr(module.subprocess, "run", lambda *args, **kwargs: None)
    assert w.run_tests(True, digest)["exit_code"] == 0
    assert w.root.stat().st_mode & 0o777 == 0o700
    with pytest.raises(ToolDenied):
        w.run_tests(True, "python:3.12-slim")
