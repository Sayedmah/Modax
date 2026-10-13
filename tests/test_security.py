import json
import os
import time

import pytest
from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings
from modax.providers import DemoProvider, ProviderError
from modax.workspace import ToolDenied, Workspace
from test_chat import register


def test_limits_and_expired_token(tmp_path):
    app = create_app(Settings(data_dir=tmp_path, allow_signup=True, requests_per_minute=5))
    with TestClient(app) as c:
        h = register(c)
        app.state.store.execute("UPDATE sessions SET expires=?", (time.time() - 1,))
        assert c.get("/api/v1/chats", headers=h).status_code == 401
        assert c.post("/api/v1/chats", headers=h, content=b"a" * 262145).status_code == 413
        for _ in range(3):
            c.get("/api/v1/health")
        assert c.get("/api/v1/health").status_code == 429


def test_provider_failure_is_persisted_without_fabrication(client):
    class FailingProvider(DemoProvider):
        async def stream_text(self, messages):
            yield "partial"
            raise ProviderError("failure")

    client.app.state.registry.providers["demo"] = FailingProvider()
    h = register(client)
    cid = client.post("/api/v1/chats", headers=h, json={}).json()["id"]
    response = client.post(f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "hi"})
    assert "event: error" in response.text and "event: done" not in response.text
    messages = client.get(f"/api/v1/chats/{cid}", headers=h).json()["messages"]
    assert messages[-1]["status"] == "failed"
    assert messages[-1]["content"] == "partial"


def test_hardlink_and_quota(tmp_path):
    w = Workspace(tmp_path / "project")
    secret = tmp_path / "outside.py"
    secret.write_text("x=1")
    os.link(secret, w.root / "linked.py")
    with pytest.raises(ToolDenied):
        w.read("linked.py")
    (w.root / "linked.py").unlink()
    with pytest.raises(ToolDenied):
        w.apply([{"path": "large.txt", "content": "x" * 131073}])


def test_invalid_codegen_is_blocked_and_no_file_written(client):
    class BadProvider(DemoProvider):
        async def stream_text(self, messages):
            yield json.dumps({"files": [{"path": "../escaped.py", "content": "x=1"}]})

    client.app.state.registry.providers["demo"] = BadProvider()
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write Python"}
    ).json()["id"]
    result = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={}).json()
    assert result["state"] == "BLOCKED"
    assert (
        client.app.state.task_engine.workspace(
            client.app.state.store.query("SELECT id FROM users")[0]["id"], tid
        ).files()
        == []
    )


def test_disabled_runtime_reports_blocker_after_preserving_files(client):
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write Python"}
    ).json()["id"]
    r = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={"execute": True}).json()
    assert r["state"] == "BLOCKED"
    assert "Runtime tests disabled" in json.loads(r["result"])["error"]
    assert client.get(f"/api/v1/tasks/{tid}/files/hello.py", headers=h).status_code == 200


def test_task_cancel_terminal_and_resume_blocked(client):
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "plan", "goal": "Plan project"}
    ).json()["id"]
    assert client.post(f"/api/v1/tasks/{tid}/cancel", headers=h).status_code == 204
    assert client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={}).status_code == 409
    assert client.post(f"/api/v1/tasks/{tid}/resume", headers=h).status_code == 409
