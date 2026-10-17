import asyncio
import json

import httpx
import pytest
from modax.providers import AnthropicProvider, HTTPProvider, Model, ProviderError
from test_chat import register


def test_usage_isolated_between_concurrent_calls_and_unknown_not_zero():
    async def server(request):
        content = json.loads(request.content)["messages"][-1]["content"]
        await asyncio.sleep(0.02 if content == "first" else 0)
        count = 12 if content == "first" else 90
        body = (
            'data: {"choices":[],"usage":{"prompt_tokens":'
            + str(count)
            + ',"completion_tokens":4}}\n\ndata: [DONE]\n\n'
        )
        return httpx.Response(200, text=body)

    provider = HTTPProvider(
        Model("usage", "compatible", "test"),
        "https://service.example/v1",
        transport=httpx.MockTransport(server),
    )

    async def scenario():
        async def run(text):
            await provider.generate_text([{"role": "user", "content": text}])
            await asyncio.sleep(0.03)
            return provider.get_usage()

        first, second = await asyncio.gather(run("first"), run("second"))
        assert first["input_tokens"] == 12
        assert second["input_tokens"] == 90
        assert first["output_tokens"] == 4
        assert provider.get_usage()["input_tokens"] is None

    asyncio.run(scenario())


@pytest.mark.parametrize("family", ["anthropic", "ollama"])
def test_provider_usage_protocols(family):
    if family == "anthropic":
        body = (
            "\n".join(
                "data: " + json.dumps(item)
                for item in [
                    {
                        "type": "message_start",
                        "message": {"usage": {"input_tokens": 30, "output_tokens": 1}},
                    },
                    {"type": "message_delta", "usage": {"output_tokens": 9}},
                    {"type": "message_stop"},
                ]
            )
            + "\n"
        )
        adapter = AnthropicProvider
    else:
        body = json.dumps({"done": True, "prompt_eval_count": 30, "eval_count": 9}) + "\n"
        adapter = HTTPProvider
    provider = adapter(
        Model("usage", family, "test"),
        "https://service.example",
        transport=httpx.MockTransport(lambda _: httpx.Response(200, text=body)),
    )

    async def scenario():
        await provider.generate_text([])
        assert provider.get_usage() == {"input_tokens": 30, "output_tokens": 9}

    asyncio.run(scenario())


def test_interrupted_stream_does_not_publish_partial_usage():
    body = 'data: {"choices":[],"usage":{"prompt_tokens":30,"completion_tokens":9}}\n\n'
    provider = HTTPProvider(
        Model("usage", "compatible", "test"),
        "https://service.example/v1",
        transport=httpx.MockTransport(lambda _: httpx.Response(200, text=body)),
    )

    async def scenario():
        with pytest.raises(ProviderError):
            await provider.generate_text([])
        assert provider.get_usage() == {"input_tokens": None, "output_tokens": None}

    asyncio.run(scenario())


def test_chat_persists_provider_reported_tokens(client):
    body = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":23,"completion_tokens":2}}\n\ndata: [DONE]\n\n'
    provider = HTTPProvider(
        Model("demo", "compatible", "test"),
        "https://service.example/v1",
        transport=httpx.MockTransport(lambda _: httpx.Response(200, text=body)),
    )
    client.app.state.registry.providers["demo"] = provider
    h = register(client)
    cid = client.post("/api/v1/chats", headers=h, json={}).json()["id"]
    assert (
        client.post(
            f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "hi", "model": "demo"}
        ).status_code
        == 200
    )
    record = client.get("/api/v1/usage", headers=h).json()["records"][0]
    assert record["input_tokens"] == 23 and record["output_tokens"] == 2
    assert record["cost"] is None


@pytest.mark.parametrize("count", [-1, True, "12", 1e200])
def test_invalid_usage_remains_unknown(count):
    body = (
        "data: "
        + json.dumps({"choices": [], "usage": {"prompt_tokens": count}})
        + "\n\ndata: [DONE]\n\n"
    )
    provider = HTTPProvider(
        Model("usage", "compatible", "test"),
        "https://service.example/v1",
        transport=httpx.MockTransport(lambda _: httpx.Response(200, text=body)),
    )

    async def scenario():
        await provider.generate_text([])
        assert provider.get_usage()["input_tokens"] is None

    asyncio.run(scenario())
