import io
import json
import threading
import zipfile

import httpx
import pytest
from fastapi.testclient import TestClient
from modax.config import Settings
from modax.sandbox import run_sandbox
from modax.sandbox_worker import create_worker
from modax.workspace import ToolDenied, Workspace
from test_chat import register

TOKEN = "disposable-sandbox-test-token-1234567890"
IMAGE = "python@sha256:" + "a" * 64
SOURCE = "import unittest\nclass Check(unittest.TestCase):\n def test_sum(self): self.assertEqual(2+2,4)\n"


def test_source_and_reports_are_owner_only_and_never_run_on_host(client, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Unconfigured sandbox must not run a host command or provider")

    monkeypatch.setattr(Workspace, "run_tests", forbidden)
    h = register(client)
    other = register(client, "foreign")
    cap = client.get("/api/v1/sandbox/capabilities", headers=h).json()
    assert cap["configured"] is False and cap["network"] is False
    assert TOKEN not in json.dumps(cap)
    task = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "sandbox", "goal": "Test source"}
    ).json()
    path = "/api/v1/tasks/" + task["id"]
    assert (
        client.post(
            path + "/project", headers=other, files={"file": ("test_sum.py", SOURCE)}
        ).status_code
        == 404
    )
    assert (
        client.post(
            path + "/project", headers=h, files={"file": ("test_sum.py", SOURCE)}
        ).status_code
        == 201
    )
    assert client.post(path + "/run", headers=h, json={}).status_code == 422
    assert client.get(path + "/report", headers=h).status_code == 409
    result = client.post(path + "/run", headers=h, json={"execute": True}).json()
    assert result["state"] == "BLOCKED" and "dedicated Docker worker" in result["result"]
    report = client.get(path + "/report", headers=h)
    assert report.status_code == 200 and report.json()["state"] == "BLOCKED"
    assert "attachment" in report.headers["content-disposition"]
    assert client.get(path + "/report", headers=other).status_code == 404
    file = client.get(path + "/attachment/test_sum.py", headers=h)
    assert file.text == SOURCE and file.headers["content-type"] == "application/octet-stream"
    assert "sandbox" in file.headers["content-security-policy"]
    assert client.get(path + "/attachment/test_sum.py", headers=other).status_code == 404
    with zipfile.ZipFile(io.BytesIO(client.get(path + "/download", headers=h).content)) as archive:
        assert archive.read("test_sum.py").decode() == SOURCE


def test_sandbox_records_observed_failure_and_success_without_model(client, monkeypatch):
    import modax.sandbox as module

    h = register(client)
    for exit_code, state in [(1, "FAILED"), (0, "COMPLETED"), (5, "FAILED")]:
        monkeypatch.setattr(
            module,
            "run_sandbox",
            lambda *a, cancel_event=None: {
                "exit_code": exit_code,
                "output": "observed fixture result",
                "duration_seconds": 0.01,
            },
        )
        task = client.post(
            "/api/v1/tasks", headers=h, json={"kind": "sandbox", "goal": "Test source"}
        ).json()
        path = "/api/v1/tasks/" + task["id"]
        result = client.post(path + "/run", headers=h, json={"execute": True}).json()
        assert result["state"] == state
        report = client.get(path + "/report", headers=h).json()["result"]
        assert report["runtime_tests"]["exit_code"] == exit_code and not report["model_called"]


def test_worker_auth_source_validation_and_bounded_failure(monkeypatch):
    def runtime(self, enabled, image):
        assert enabled and image == IMAGE
        assert self.read("test_sum.py") == SOURCE
        return {"exit_code": 1, "output": "actual transport fixture", "duration_seconds": 0.5}

    monkeypatch.setattr(Workspace, "run_tests", runtime)
    with pytest.raises(ValueError):
        create_worker("short", IMAGE)
    with TestClient(create_worker(TOKEN, IMAGE)) as worker:
        headers = {"X-Modax-Sandbox-Token": TOKEN}
        assert worker.post("/v1/test", json={}).status_code == 401
        assert TOKEN not in worker.get("/health").text
        assert (
            worker.post(
                "/v1/test",
                headers=headers,
                json={"files": [{"path": "../escape.py", "content": SOURCE}]},
            ).status_code
            == 422
        )
        assert worker.post("/v1/test", headers=headers, content=b"x" * 262145).status_code == 413
        response = worker.post(
            "/v1/test",
            headers=headers,
            json={"files": [{"path": "test_sum.py", "content": SOURCE}]},
        )
        assert response.status_code == 200 and response.json()["exit_code"] == 1

        def failed(*args):
            error = ToolDenied("Command timed out")
            error.result = {"exit_code": 0, "output": "partial", "duration_seconds": 60}
            raise error

        monkeypatch.setattr(Workspace, "run_tests", failed)
        response = worker.post(
            "/v1/test",
            headers=headers,
            json={"files": [{"path": "test_sum.py", "content": SOURCE}]},
        )
        assert response.json()["exit_code"] == -1


def test_remote_transport_is_server_only_and_rejects_bad_results(tmp_path, monkeypatch):
    import modax.sandbox as module

    workspace = Workspace(tmp_path / "source")
    workspace.apply([{"path": "test_sum.py", "content": SOURCE}])
    settings = Settings(sandbox_url="https://sandbox.example.org", sandbox_token=TOKEN)
    real = httpx.Client
    payload = {"exit_code": 0, "output": "one test", "duration_seconds": 0.2}

    def handler(request):
        assert request.url == "https://sandbox.example.org/v1/test"
        assert request.headers["X-Modax-Sandbox-Token"] == TOKEN
        assert "Authorization" not in request.headers and "Cookie" not in request.headers
        assert set(json.loads(request.content)) == {"files"}
        return httpx.Response(200, json=payload)

    monkeypatch.setattr(
        module.httpx, "Client", lambda **kw: real(**kw, transport=httpx.MockTransport(handler))
    )
    assert run_sandbox(workspace, settings)["exit_code"] == 0
    payload["exit_code"] = True
    with pytest.raises(ToolDenied):
        run_sandbox(workspace, settings)
    stop = threading.Event()
    stop.set()
    with pytest.raises(ToolDenied, match="cancelled"):
        run_sandbox(workspace, settings, stop)
    with pytest.raises(ValueError):
        Settings(sandbox_url="http://unapproved.example.org")


def test_upload_rejects_invalid_or_secret_source(client):
    h = register(client)
    task = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "sandbox", "goal": "Test source"}
    ).json()
    path = "/api/v1/tasks/" + task["id"] + "/project"
    for name, text in [
        ("../escape.py", SOURCE),
        ("bad.py", "if ("),
        ("key.py", "api_key='private'"),
    ]:
        assert client.post(path, headers=h, files={"file": (name, text)}).status_code == 422
