import asyncio
import json

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings
from modax.providers import HTTPProvider, Model, ProviderError, Registry
from test_chat import register

ENDPOINTS = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "openrouter": "https://openrouter.ai/api/v1",
}


@pytest.mark.parametrize("family", ENDPOINTS)
def test_named_provider_stream_and_usage(family):
    def serve(request):
        assert str(request.url) == ENDPOINTS[family] + "/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-secret"
        payload = json.loads(request.content)
        assert payload["stream_options"] == {"include_usage": True}
        assert payload["model"] == "configured-model"
        if family == "gemini":
            assert request.headers["x-goog-api-client"] == "modax-omega/0.3.4"
        body = 'data: {"choices":[{"delta":{"content":"مرحبا"}}]}\n\n'
        body += 'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\n'
        return httpx.Response(200, text=body + "data: [DONE]\n\n")

    p = HTTPProvider(
        Model(family, family, "configured-model"),
        ENDPOINTS[family],
        "test-secret",
        httpx.MockTransport(serve),
    )

    async def run():
        assert await p.generate_text([{"role": "user", "content": "hello"}]) == "مرحبا"
        assert p.get_usage() == {"input_tokens": 4, "output_tokens": 2}

    asyncio.run(run())


@pytest.mark.parametrize("family", ENDPOINTS)
def test_profile_encrypted_and_endpoint_pinned(tmp_path, family):
    app = create_app(
        Settings(data_dir=tmp_path, allow_signup=True, secret_key=Fernet.generate_key().decode())
    )
    with TestClient(app) as client:
        owner = register(client)
        body = {
            "family": family,
            "model": "configured-model",
            "api_key": "test-secret",
            "base_url": ENDPOINTS[family] + "/",
        }
        created = client.post("/api/v1/providers", headers=owner, json=body)
        assert created.status_code == 201, created.text
        assert "test-secret" not in created.text
        pid = created.json()["id"]
        assert pid in [m["id"] for m in client.get("/api/v1/models", headers=owner).json()]
        body["base_url"] = "https://api.openai.com/v1"
        assert client.post("/api/v1/providers", headers=owner, json=body).status_code == 422
        body["base_url"] = ENDPOINTS[family] + "/wrong"
        assert client.post("/api/v1/providers", headers=owner, json=body).status_code == 422
        other = register(client, "other")
        assert client.get("/api/v1/providers", headers=other).json() == []


def test_server_configuration_prefers_real_providers():
    registry = Registry(
        Settings(
            gemini_key="test-key",
            gemini_model="gemini-test",
            openrouter_key="test-key",
            openrouter_model="vendor/test",
        )
    )
    assert registry.select().model.provider == "gemini"
    assert registry.select("openrouter").model.model == "vendor/test"
    empty = Registry(Settings(gemini_key="test-key", gemini_model=""))
    assert "gemini" not in empty.providers


@pytest.mark.parametrize("family", ENDPOINTS)
def test_named_provider_failure_is_sanitized(family):
    p = HTTPProvider(
        Model(family, family, "configured-model"),
        ENDPOINTS[family],
        "test-secret",
        httpx.MockTransport(lambda request: httpx.Response(429, text="test-secret")),
    )
    with pytest.raises(ProviderError) as error:
        asyncio.run(p.generate_text([]))
    assert "test-secret" not in str(error.value)
