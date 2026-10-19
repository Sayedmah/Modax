import asyncio
import json

import httpx
import pytest
from modax.config import Settings
from modax.providers import (
    CapabilityError,
    DemoProvider,
    HTTPProvider,
    Model,
    ProviderError,
    Registry,
)


def test_capability_error_and_empty_registry(tmp_path):
    with pytest.raises(CapabilityError):
        asyncio.run(DemoProvider().generate_video("hi"))
    with pytest.raises(CapabilityError):
        Registry(Settings(data_dir=tmp_path, demo=False)).select()


@pytest.mark.parametrize("family", ["compatible", "ollama"])
def test_real_protocol_stream(family):
    def server(request):
        payload = json.loads(request.content)
        assert payload["model"] == "test-model"
        assert payload["stream"] is True
        if family == "ollama":
            assert request.url.path == "/api/chat"
            body = '{"message":{"content":"مرحبا"},"done":false}\n{"done":true}\n'
        else:
            assert request.url.path == "/v1/chat/completions"
            assert request.headers["Authorization"] == "Bearer secret-test"
            body = 'data: {"choices":[{"delta":{"content":"مرحبا"}}]}\n\ndata: [DONE]\n\n'
        return httpx.Response(200, text=body)

    provider = HTTPProvider(
        Model("test", family, "test-model"),
        "http://127.0.0.1" + ("/v1" if family == "compatible" else ""),
        "secret-test",
        httpx.MockTransport(server),
    )
    assert asyncio.run(provider.generate_text([{"role": "user", "content": "hi"}])) == "مرحبا"


def test_provider_error_does_not_leak_secrets():
    p = HTTPProvider(
        Model("test", "compatible", "test"),
        "https://service.example/v1",
        "secret-test",
        httpx.MockTransport(lambda r: httpx.Response(401, text="secret-test")),
    )
    with pytest.raises(ProviderError) as error:
        asyncio.run(p.generate_text([]))
    assert "secret-test" not in str(error.value)


def test_truncated_stream_is_not_success():
    p = HTTPProvider(
        Model("x", "compatible", "test"),
        "https://service.example/v1",
        transport=httpx.MockTransport(
            lambda r: httpx.Response(
                200, text='data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
            )
        ),
    )
    with pytest.raises(ProviderError):
        asyncio.run(p.generate_text([]))


def test_malformed_stream_becomes_provider_error():
    p = HTTPProvider(
        Model("x", "compatible", "test"),
        "https://service.example/v1",
        transport=httpx.MockTransport(lambda r: httpx.Response(200, text="data: []\n\n")),
    )
    with pytest.raises(ProviderError):
        asyncio.run(p.generate_text([]))
