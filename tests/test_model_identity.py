import asyncio
import json

import httpx
from modax.providers import HTTPProvider, Model
from test_chat import register


def test_auto_identity_survives_history(client):
    headers = register(client)
    chat = client.post("/api/v1/chats", headers=headers, json={"title": "Identity"}).json()
    response = client.post(
        f"/api/v1/chats/{chat['id']}/messages",
        headers=headers,
        json={"content": "hello", "model": "auto"},
    )
    events = [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]
    assert events[0]["configured_model"] == "deterministic-test-adapter"
    assert events[0]["provider"] == "demo" and events[0]["demo"] is True
    assert events[-1]["status"] == "completed"
    saved = client.get(f"/api/v1/chats/{chat['id']}", headers=headers).json()["messages"][-1]
    assert saved["model"] == "deterministic-test-adapter"


def test_reported_router_identity_and_reset(client):
    def reply(request):
        assert json.loads(request.content)["model"] == "openrouter/free"
        body = "data: " + json.dumps(
            {"model": "vendor/actual-model-v2", "choices": [{"delta": {"content": "Hello"}}]}
        )
        return httpx.Response(200, text=body + "\n\ndata: [DONE]\n\n")

    provider = HTTPProvider(
        Model("router", "openrouter", "openrouter/free"),
        "https://openrouter.ai/api/v1",
        "fake-test-key",
        transport=httpx.MockTransport(reply),
    )
    client.app.state.registry.providers = {"router": provider}
    headers = register(client)
    chat = client.post("/api/v1/chats", headers=headers, json={"title": "Router"}).json()
    response = client.post(
        f"/api/v1/chats/{chat['id']}/messages", headers=headers, json={"content": "hello"}
    )
    events = [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]
    assert events[0]["reported_model"] is None
    assert events[-1]["reported_model"] == "vendor/actual-model-v2"
    saved = client.get(f"/api/v1/chats/{chat['id']}", headers=headers).json()["messages"][-1]
    assert saved["model"] == "vendor/actual-model-v2"


def test_identity_is_scoped_to_concurrent_call():
    provider = HTTPProvider(
        Model("router", "openrouter", "openrouter/free"), "https://example.test"
    )

    async def worker(name):
        provider.reset_usage()
        provider.record_model(name)
        await asyncio.sleep(0)
        return provider.get_identity()["reported_model"]

    async def run():
        return await asyncio.gather(worker("model-a"), worker("model-b"))

    assert asyncio.run(run()) == ["model-a", "model-b"]
    provider.reset_usage()
    for bad in (None, 4, "", "x" * 101, "bad\nmodel"):
        provider.record_model(bad)
        assert provider.get_identity()["reported_model"] is None
