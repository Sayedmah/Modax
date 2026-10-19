"""Capability-aware adapters; no client-supplied endpoints or keys."""

import asyncio
import json
from contextvars import ContextVar
from dataclasses import dataclass

import httpx

_USAGE = ContextVar("modax_provider_usage", default=None)
_IDENTITY = ContextVar("modax_provider_identity", default=None)


class CapabilityError(ValueError):
    pass


class ProviderError(RuntimeError):
    pass


@dataclass
class Model:
    id: str
    provider: str
    model: str
    demo: bool = False
    capabilities: tuple = ("text", "stream", "code")
    pricing: dict | None = None
    context_limit: int | None = None
    availability: str = "configured_unverified"


class Provider:
    def __init__(self, model):
        self.model = model

    def get_capabilities(self):
        return self.model.capabilities

    async def generate_text(self, messages):
        self.reset_usage()
        return "".join([part async for part in self.stream_text(messages)])

    def reset_usage(self):
        _USAGE.set((self, {"input_tokens": None, "output_tokens": None, "complete": False}))
        _IDENTITY.set((self, None))

    def record_model(self, name):
        if isinstance(name, str) and 0 < len(name) <= 100 and name.isprintable():
            _IDENTITY.set((self, name))

    def get_identity(self):
        current = _IDENTITY.get()
        reported = current[1] if current and current[0] is self else None
        return {
            "provider": self.model.provider,
            "configured_model": self.model.model,
            "reported_model": reported,
            "demo": self.model.demo,
        }

    def record_usage(self, input_tokens=None, output_tokens=None, complete=False):
        current = _USAGE.get()
        data = (
            dict(current[1])
            if current and current[0] is self
            else {"input_tokens": None, "output_tokens": None, "complete": False}
        )
        for name, count in (("input_tokens", input_tokens), ("output_tokens", output_tokens)):
            if type(count) is int and 0 <= count <= 1000000000:
                data[name] = count
            elif count is not None:
                data[name] = None
        if complete:
            data["complete"] = True
        _USAGE.set((self, data))

    def get_usage(self):
        current = _USAGE.get()
        unknown = {"input_tokens": None, "output_tokens": None}
        if not current or current[0] is not self or not current[1]["complete"]:
            return unknown
        return {key: current[1][key] for key in unknown}

    def require_capability(self, capability):
        if capability not in self.model.capabilities:
            raise CapabilityError(f"{self.model.id} does not support {capability}")

    async def generate_image(self, *args, **kwargs):
        self.require_capability("image_generation")

    async def generate_video(self, *args, **kwargs):
        self.require_capability("video_generation")


class DemoProvider(Provider):
    def __init__(self):
        super().__init__(
            Model("demo", "demo", "deterministic-test-adapter", True, availability="demo")
        )

    async def stream_text(self, messages):
        self.reset_usage()
        if messages[0].get("content", "").startswith("MODAX_HTML_JSON"):
            answer = json.dumps(
                {
                    "html": '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MODAX HTML DEMO</title><style>body{font:18px system-ui;margin:40px;background:#10202b;color:#eef5fa}main{max-width:720px;margin:auto}</style></head><body><main><h1>MODAX HTML — DEMO</h1><p>صفحة اختبار ثابتة؛ ليست نتيجة نموذج ذكاء حقيقي.</p></main></body></html>'
                }
            )
        elif messages[0].get("content", "").startswith("MODAX_REVIEW_JSON"):
            answer = json.dumps({"approved": True, "findings": []})
        elif messages[0].get("content", "").startswith("MODAX_CODE_JSON"):
            answer = json.dumps(
                {
                    "files": [
                        {
                            "path": "hello.py",
                            "content": 'def greet(name):\n    return "Hello, " + name\n',
                        },
                        {
                            "path": "test_hello.py",
                            "content": 'import unittest\nfrom hello import greet\n\nclass GreetingTest(unittest.TestCase):\n    def test_greeting(self):\n        self.assertEqual(greet("MODAX"), "Hello, MODAX")\n',
                        },
                    ]
                }
            )
        else:
            answer = "[DEMO — استجابة تجريبية وليست نموذج ذكاء اصطناعي] " + messages[-1]["content"]
        for i in range(0, len(answer), 24):
            await asyncio.sleep(0)
            yield answer[i : i + 24]


class HTTPProvider(Provider):
    def __init__(self, model, base_url, key="", transport=None):
        super().__init__(model)
        self.base_url = base_url.rstrip("/")
        self.key = key
        self.transport = transport

    async def stream_text(self, messages):
        self.reset_usage()
        ollama = self.model.provider == "ollama"
        url = self.base_url + ("/api/chat" if ollama else "/chat/completions")
        headers = {"Authorization": "Bearer " + self.key} if self.key else {}
        if self.model.provider == "gemini":
            headers["x-goog-api-client"] = "modax-omega/0.3.4"
        elif self.model.provider == "openrouter":
            headers["X-Title"] = "MODAX OMEGA"
        payload = {"model": self.model.model, "messages": messages, "stream": True}
        if ollama:
            payload["options"] = {"num_predict": 4096}
        else:
            payload["max_tokens"] = 4096
            if self.base_url == "https://api.openai.com/v1" or self.model.provider in {
                "gemini",
                "openrouter",
            }:
                payload["stream_options"] = {"include_usage": True}
        total = 0
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(90, connect=10),
                transport=self.transport,
                follow_redirects=False,
            ) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or (not ollama and not line.startswith("data: ")):
                            continue
                        data = line if ollama else line[6:]
                        if data == "[DONE]":
                            self.record_usage(complete=True)
                            return
                        record = json.loads(data)
                        if not isinstance(record, dict):
                            raise ProviderError("Malformed provider event")
                        if record.get("error"):
                            raise ProviderError("Provider returned an error")
                        self.record_model(record.get("model"))
                        usage = record.get("usage")
                        if isinstance(usage, dict):
                            self.record_usage(
                                usage.get("prompt_tokens"), usage.get("completion_tokens")
                            )
                        if ollama:
                            message = record.get("message", {})
                            if not isinstance(message, dict):
                                raise ProviderError("Malformed provider message")
                            delta = message.get("content", "")
                        else:
                            choices = record.get("choices", [])
                            if not isinstance(choices, list) or (
                                choices and not isinstance(choices[0], dict)
                            ):
                                raise ProviderError("Malformed provider choices")
                            change = choices[0].get("delta", {}) if choices else {}
                            if not isinstance(change, dict):
                                raise ProviderError("Malformed provider delta")
                            delta = change.get("content", "")
                        if delta is not None and not isinstance(delta, str):
                            raise ProviderError("Malformed provider content")
                        if delta:
                            total += len(delta)
                            if total > 100000:
                                raise ProviderError("Response limit exceeded")
                            yield delta
                        if ollama and record.get("done") is True:
                            self.record_usage(
                                record.get("prompt_eval_count"),
                                record.get("eval_count"),
                                complete=True,
                            )
                            return
                    raise ProviderError("Provider stream ended before its completion marker")
        except (httpx.HTTPError, json.JSONDecodeError, TypeError, KeyError) as exc:
            # Provider bodies can contain secrets. Do not forward raw responses.
            raise ProviderError(
                "Provider request failed; check server configuration or service availability"
            ) from exc


class Registry:
    def __init__(self, settings):
        self.providers = {}
        if settings.demo:
            self.providers["demo"] = DemoProvider()
        for family, key, model, url in (
            (
                "gemini",
                settings.gemini_key,
                settings.gemini_model,
                "https://generativelanguage.googleapis.com/v1beta/openai",
            ),
            (
                "openrouter",
                settings.openrouter_key,
                settings.openrouter_model,
                "https://openrouter.ai/api/v1",
            ),
        ):
            if key and model:
                self.providers[family] = HTTPProvider(Model(family, family, model), url, key)
        if settings.provider_url and settings.provider_model and settings.provider_key:
            self.providers["compatible"] = HTTPProvider(
                Model("compatible", "compatible", settings.provider_model),
                settings.provider_url,
                settings.provider_key,
            )
        if settings.ollama_url and settings.ollama_model:
            self.providers["ollama"] = HTTPProvider(
                Model("ollama", "ollama", settings.ollama_model), settings.ollama_url
            )

    def select(self, model_id="auto", capability="text"):
        if model_id == "auto":
            candidates = [p for p in self.providers.values() if capability in p.get_capabilities()]
            candidates.sort(key=lambda p: p.model.demo)
            if not candidates:
                raise CapabilityError("No configured provider supports this task")
            return candidates[0]
        p = self.providers.get(model_id)
        if p is None:
            raise CapabilityError("Model is not configured")
        p.require_capability(capability)
        return p


class AnthropicProvider(HTTPProvider):
    async def stream_text(self, messages):
        self.reset_usage()
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        history = [m for m in messages if m["role"] != "system"]
        payload = {
            "model": self.model.model,
            "messages": history,
            "max_tokens": 4096,
            "stream": True,
        }
        if system:
            payload["system"] = system
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(90, connect=10),
                transport=self.transport,
                follow_redirects=False,
            ) as client:
                async with client.stream(
                    "POST",
                    self.base_url + "/messages",
                    headers={"x-api-key": self.key, "anthropic-version": "2023-06-01"},
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    size = 0
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = json.loads(line[6:])
                        if not isinstance(data, dict):
                            raise ProviderError("Malformed Anthropic event")
                        if data.get("type") == "message_stop":
                            self.record_usage(complete=True)
                            return
                        if data.get("type") in {"message_start", "message_delta"}:
                            envelope = (
                                data.get("message", {}) if data["type"] == "message_start" else data
                            )
                            usage = envelope.get("usage") if isinstance(envelope, dict) else None
                            if isinstance(usage, dict):
                                self.record_usage(
                                    usage.get("input_tokens"), usage.get("output_tokens")
                                )
                        if data.get("type") == "error":
                            raise ProviderError("Anthropic returned an error")
                        if data.get("type") == "content_block_delta":
                            delta = data.get("delta", {})
                            if not isinstance(delta, dict):
                                raise ProviderError("Malformed Anthropic delta")
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if not isinstance(text, str):
                                    raise ProviderError("Malformed Anthropic text")
                                size += len(text)
                                if size > 100000:
                                    raise ProviderError("Response limit exceeded")
                                yield text
                    raise ProviderError("Anthropic stream ended before message_stop")
        except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError) as exc:
            raise ProviderError("Anthropic request failed; inspect configuration") from exc
