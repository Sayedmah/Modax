import json

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings
from test_chat import register


def test_profile_secret_encryption_and_owner_isolation(tmp_path):
    key = Fernet.generate_key().decode()
    app = create_app(Settings(data_dir=tmp_path, allow_signup=True, secret_key=key))
    with TestClient(app) as c:
        h = register(c)
        result = c.post(
            "/api/v1/providers",
            headers=h,
            json={
                "family": "compatible",
                "model": "test-model",
                "api_key": "test-sensitive-secret",
                "base_url": "https://api.openai.com/v1",
            },
        )
        assert result.status_code == 201, result.text
        pid = result.json()["id"]
        assert "test-sensitive-secret" not in result.text
        assert "test-sensitive-secret" not in c.get("/api/v1/providers", headers=h).text
        assert b"test-sensitive-secret" not in (tmp_path / "modax.sqlite3").read_bytes()
        assert pid in [m["id"] for m in c.get("/api/v1/models", headers=h).json()]
        other = register(c, "bob")
        assert c.get("/api/v1/providers", headers=other).json() == []
        assert c.delete("/api/v1/providers/" + pid, headers=other).status_code == 404
        assert c.delete("/api/v1/providers/" + pid, headers=h).status_code == 204


def test_profile_rejects_private_endpoints(client):
    h = register(client)
    assert (
        client.post(
            "/api/v1/providers",
            headers=h,
            json={
                "family": "compatible",
                "model": "x",
                "api_key": "secret",
                "base_url": "http://169.254.169.254/",
            },
        ).status_code
        == 422
    )


def test_document_upload_search_and_chat_grounding(client):
    h = register(client)
    r = client.post(
        "/api/v1/files",
        headers=h,
        files={"file": ("costs.csv", b"material,cost\npaper,150\nplastic,80\n", "text/csv")},
    )
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["chunks"] >= 1
    hits = client.get("/api/v1/files/search", headers=h, params={"q": "plastic"}).json()
    assert hits[0]["file_id"] == doc["id"]
    cid = client.post("/api/v1/chats", headers=h, json={}).json()["id"]
    reply = client.post(
        f"/api/v1/chats/{cid}/messages",
        headers=h,
        json={"content": "Summarize", "attachment_ids": [doc["id"]]},
    )
    assert "event: done" in reply.text
    other = register(client, "bob")
    assert client.get("/api/v1/files", headers=other).json() == []
    assert client.get("/api/v1/files/" + doc["id"], headers=other).status_code == 404
    assert client.delete("/api/v1/files/" + doc["id"], headers=h).status_code == 204


def test_upload_rejects_unsupported_and_secret(client):
    h = register(client)
    assert (
        client.post("/api/v1/files", headers=h, files={"file": ("run.exe", b"data")}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/files", headers=h, files={"file": ("secret.txt", b"api_key=secret-value")}
        ).status_code
        == 422
    )


def test_chat_import_edit_and_delete(client):
    h = register(client)
    r = client.post(
        "/api/v1/chats/import",
        headers=h,
        json={
            "title": "imported",
            "messages": [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "response"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    chat = client.get("/api/v1/chats/" + cid, headers=h).json()
    assert len(chat["messages"]) == 2
    mid = chat["messages"][0]["id"]
    assert (
        client.patch(
            f"/api/v1/chats/{cid}/messages/{mid}", headers=h, json={"content": "edited"}
        ).status_code
        == 200
    )
    assert len(client.get("/api/v1/chats/" + cid, headers=h).json()["messages"]) == 1
    assert client.delete("/api/v1/chats/" + cid, headers=h).status_code == 204


def test_demo_arena_is_actual_scoring_not_fake_intelligence(client):
    h = register(client)
    result = client.post("/api/v1/arena/runs", headers=h, json={"models": ["demo"]})
    assert result.status_code == 201, result.text
    run = result.json()
    assert run["dataset"] == "core-v1"
    assert run["results"][0]["score"] == 0
    assert run["results"][0]["demo"] is True
    assert len(client.get("/api/v1/arena/runs", headers=h).json()) == 1


def test_settings_enable_memory_and_owner_scope(client):
    h = register(client)
    assert client.put("/api/v1/settings", headers=h, json={"use_memory": True}).status_code == 200
    assert client.get("/api/v1/settings", headers=h).json()["use_memory"] is True
    other = register(client, "bob")
    assert client.get("/api/v1/settings", headers=other).json()["use_memory"] is False


def test_coder_repairs_invalid_source_using_observed_error(client):
    from modax.providers import DemoProvider

    class RepairProvider(DemoProvider):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def stream_text(self, messages):
            self.calls += 1
            if self.calls == 1:
                yield json.dumps({"files": [{"path": "main.py", "content": "if ("}]})
            else:
                assert "syntax" in messages[-1]["content"].lower()
                yield json.dumps({"files": [{"path": "main.py", "content": "result = 56\n"}]})

    p = RepairProvider()
    client.app.state.registry.providers["demo"] = p
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write code"}
    ).json()["id"]
    r = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={}).json()
    assert r["state"] == "COMPLETED", r
    assert p.calls == 2 and json.loads(r["result"])["repair_attempts"] == 1


def test_anthropic_stream_protocol_and_truncation():
    import asyncio

    import httpx
    from modax.providers import AnthropicProvider, Model, ProviderError

    def server(request):
        assert request.headers["x-api-key"] == "secret"
        assert request.url.path == "/v1/messages"
        assert json.loads(request.content)["system"] == "system"
        return httpx.Response(
            200,
            text='data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\ndata: {"type":"message_stop"}\n\n',
        )

    p = AnthropicProvider(
        Model("x", "anthropic", "test"),
        "https://api.anthropic.com/v1",
        "secret",
        httpx.MockTransport(server),
    )
    assert (
        asyncio.run(
            p.generate_text(
                [{"role": "system", "content": "system"}, {"role": "user", "content": "hi"}]
            )
        )
        == "Hello"
    )
    p.transport = httpx.MockTransport(
        lambda r: httpx.Response(200, text='data: {"type":"ping"}\n\n')
    )
    with pytest.raises(ProviderError):
        asyncio.run(p.generate_text([{"role": "user", "content": "hi"}]))


def test_workspace_survives_disk_loss_and_rehydrates_from_database(client):
    import shutil

    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Create a greeting"}
    ).json()["id"]
    assert (
        client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={}).json()["state"] == "COMPLETED"
    )
    shutil.rmtree(client.app.state.settings.data_dir / "workspaces")
    assert client.get(f"/api/v1/tasks/{tid}/files/hello.py", headers=h).status_code == 200


def test_daily_chat_quota_is_enforced(client):
    h = register(client)
    client.put("/api/v1/settings", headers=h, json={"requests_per_day": 1})
    cid = client.post("/api/v1/chats", headers=h, json={}).json()["id"]
    assert (
        client.post(f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "one"}).status_code
        == 200
    )
    assert (
        client.post(f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "two"}).status_code
        == 429
    )


def test_concurrent_chat_calls_cannot_exceed_quota(client):
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    from modax.providers import DemoProvider

    class Slow(DemoProvider):
        async def stream_text(self, messages):
            await asyncio.sleep(0.15)
            yield "response"

    client.app.state.registry.providers["demo"] = Slow()
    h = register(client)
    client.put("/api/v1/settings", headers=h, json={"requests_per_day": 1})
    ids = [client.post("/api/v1/chats", headers=h, json={}).json()["id"] for _ in range(3)]
    with ThreadPoolExecutor(max_workers=3) as pool:
        codes = list(
            pool.map(
                lambda cid: (
                    client.post(
                        f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "test"}
                    ).status_code
                ),
                ids,
            )
        )
    assert sorted(codes) == [200, 429, 429]


def test_malformed_provider_port_is_rejected(client):
    h = register(client)
    assert (
        client.post(
            "/api/v1/providers",
            headers=h,
            json={
                "family": "compatible",
                "model": "x",
                "api_key": "secret",
                "base_url": "https://api.openai.com:invalid/v1",
            },
        ).status_code
        == 422
    )
