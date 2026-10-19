import asyncio
import io
import json
import zipfile

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from modax import research
from modax.api import create_app
from modax.config import Settings
from modax.providers import DemoProvider
from test_chat import register


def test_modes_history_owner_archive_and_instructions(client, monkeypatch):
    h = register(client)
    seen = []
    original = DemoProvider.stream_text

    async def capture(self, messages):
        seen.append(messages)
        async for part in original(self, messages):
            yield part

    monkeypatch.setattr(DemoProvider, "stream_text", capture)
    ids = {}
    for mode in ("M", "X"):
        r = client.post("/api/v1/chats", headers=h, json={"title": mode, "workspace_mode": mode})
        assert r.status_code == 201
        ids[mode] = r.json()["id"]
        assert (
            client.post(
                f"/api/v1/chats/{ids[mode]}/messages",
                headers=h,
                json={"content": "hello", "model": "demo"},
            ).status_code
            == 200
        )
        assert client.get(f"/api/v1/chats/{ids[mode]}", headers=h).json()["workspace_mode"] == mode
        rows = client.get("/api/v1/chats", headers=h, params={"workspace_mode": mode}).json()
        assert [row["id"] for row in rows] == [ids[mode]]
    assert "MODAX M chat" in seen[0][0]["content"]
    assert "MODAX X work" in seen[1][0]["content"]
    assert len(client.get("/api/v1/chats", headers=h).json()) == 2
    assert (
        client.post("/api/v1/chats", headers=h, json={"workspace_mode": "bad"}).status_code == 422
    )
    other = register(client, "other")
    assert client.get("/api/v1/chats?workspace_mode=X", headers=other).json() == []
    assert client.get(f"/api/v1/chats/{ids['X']}", headers=other).status_code == 404
    payload = client.get("/api/v1/account/export", headers=h).content
    z = zipfile.ZipFile(io.BytesIO(payload))
    assert {json.loads(line)["workspace_mode"] for line in z.read("chats.ndjson").splitlines()} == {
        "M",
        "X",
    }
    r = client.post(
        "/api/v1/account/import-chats",
        headers=other,
        files={"file": ("export.zip", payload, "application/zip")},
    )
    assert r.status_code == 201, r.text
    assert len(client.get("/api/v1/chats?workspace_mode=X", headers=other).json()) == 1
    assert len(client.get("/api/v1/chats?workspace_mode=M", headers=other).json()) == 1


def test_legacy_chats_default_m_and_search_fails_without_side_effects(client):
    h = register(client)
    cid = client.post(
        "/api/v1/chats/import", headers=h, json={"messages": [], "workspace_mode": "X"}
    ).json()["id"]
    client.app.state.store.execute("DELETE FROM chat_modes WHERE chat_id=?", (cid,))
    assert client.get("/api/v1/chats?workspace_mode=M", headers=h).json()[0]["id"] == cid
    assert client.get("/api/v1/workspace/capabilities", headers=h).json()["web_search"] is False
    assert client.get("/api/v1/workspace/capabilities").status_code == 401
    for confirm, expected in ((False, 403), (True, 503)):
        r = client.post(
            f"/api/v1/chats/{cid}/messages",
            headers=h,
            json={"content": "hello", "web_query": "test", "confirm_external_search": confirm},
        )
        assert r.status_code == expected, r.text
    assert client.get(f"/api/v1/chats/{cid}", headers=h).json()["messages"] == []


def test_search_contract_sanitization_and_grounding(tmp_path, monkeypatch):
    requests = []
    real_client = httpx.AsyncClient

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "<script>alert(1)</script>",
                        "url": "https://docs.python.org/3/",
                        "content": "reference",
                    },
                    {"url": "javascript:alert(1)"},
                    {"url": "https://127.0.0.1/"},
                    {"url": "https://docs.python.org/3/"},
                ]
            },
        )

    monkeypatch.setattr(
        "modax.research.httpx.AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    with TestClient(
        create_app(
            Settings(data_dir=tmp_path, allow_signup=True, searxng_url="https://search.example.org")
        )
    ) as c:
        h = register(c)
        r = c.post(
            "/api/v1/research/search",
            headers=h,
            json={"query": "Python docs", "confirm_external_search": True},
        )
        assert r.status_code == 200, r.text
        assert len(r.json()["results"]) == 1
        assert requests[0].url.params["format"] == "json"
        assert requests[0].url.params["q"] == "Python docs"
        assert "authorization" not in requests[0].headers
        assert (
            c.post("/api/v1/research/search", headers=h, json={"query": "Python"}).status_code
            == 403
        )
        assert len(requests) == 1
        cid = c.post("/api/v1/chats", headers=h, json={}).json()["id"]
        assert (
            c.post(
                f"/api/v1/chats/{cid}/messages",
                headers=h,
                json={
                    "content": "Explain",
                    "web_query": "Python docs",
                    "confirm_external_search": True,
                },
            ).status_code
            == 200
        )


@pytest.mark.parametrize("payload", [b"bad json", b'{"results":null}', b"x" * 262145])
def test_search_failure_is_bounded_and_generic(tmp_path, monkeypatch, payload):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        "modax.research.httpx.AsyncClient",
        lambda **kw: real_client(
            transport=httpx.MockTransport(lambda req: httpx.Response(200, content=payload)), **kw
        ),
    )
    with TestClient(
        create_app(
            Settings(data_dir=tmp_path, allow_signup=True, searxng_url="https://search.example.org")
        )
    ) as c:
        h = register(c)
        r = c.post(
            "/api/v1/research/search",
            headers=h,
            json={"query": "test", "confirm_external_search": True},
        )
        assert r.status_code == 502
        assert "bad json" not in r.text


def test_search_concurrency_cancellation_and_timeout(monkeypatch):
    async def scenario():
        gate = asyncio.Event()

        async def slow(*args):
            await gate.wait()

        monkeypatch.setattr(research, "_search_slots", asyncio.Semaphore(2))
        monkeypatch.setattr(research, "_search", slow)
        pending = [asyncio.create_task(research.search_web("", "q", True)) for _ in range(2)]
        await asyncio.sleep(0)
        with pytest.raises(HTTPException) as error:
            await research.search_web("", "q", True)
        assert error.value.status_code == 429
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        assert not research._search_slots.locked()

        async def timeout(*args):
            raise TimeoutError()

        monkeypatch.setattr(research, "_search", timeout)
        with pytest.raises(HTTPException) as error:
            await research.search_web("", "q", True)
        assert error.value.status_code == 504

    asyncio.run(scenario())
