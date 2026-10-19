import importlib.util
import io
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings
from test_chat import register

spec = importlib.util.spec_from_file_location(
    "modax_search_gateway", Path(__file__).parents[1] / "deployment/searxng/gateway.py"
)
gateway_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway_module)
SearchGateway = gateway_module.SearchGateway
TOKEN = "disposable-search-fixture-token-1234567890"


def call(gateway, query="q=Python", token=TOKEN, path="/search", method="GET"):
    status = []
    environ = {
        "PATH_INFO": path,
        "REQUEST_METHOD": method,
        "QUERY_STRING": query,
        "HTTP_X_MODAX_SEARCH_TOKEN": token,
        "HTTP_COOKIE": "private-cookie",
        "HTTP_AUTHORIZATION": "Bearer private-owner",
        "wsgi.input": io.BytesIO(),
    }
    body = b"".join(gateway(environ, lambda code, headers: status.append((code, headers))))
    return int(status[0][0][:3]), json.loads(body)


def producer(environ, start):
    assert "HTTP_X_MODAX_SEARCH_TOKEN" not in environ
    assert "HTTP_AUTHORIZATION" not in environ and "HTTP_COOKIE" not in environ
    assert "format=json" in environ["QUERY_STRING"]
    start("200 OK", [])
    return [
        json.dumps(
            {
                "results": [
                    {
                        "url": "https://docs.python.org/3/",
                        "title": "Python",
                        "content": "Documentation",
                    }
                ],
                "unresponsive_engines": [["fixture", "timeout"]],
            }
        ).encode()
    ]


def test_gateway_auth_source_bounds_and_partial_results():
    gateway = SearchGateway(producer, TOKEN)
    assert call(gateway, token="")[0] == 401
    assert call(gateway, path="/health", token="")[0] == 200
    assert "github.com" in call(gateway, path="/source", token="")[1]["source"]
    assert call(gateway, method="POST")[0] == 405
    assert call(gateway, path="/arbitrary")[0] == 404
    assert call(gateway, query="q=x&engines=any")[0] == 422
    assert call(gateway, query="q=a&q=b")[0] == 422
    assert call(gateway, query="q=" + "x" * 241)[0] == 422
    code, data = call(gateway)
    assert code == 200 and data["unavailable_engine_count"] == 1
    assert data["results"][0]["title"] == "Python"
    assert not gateway.slots._value == 0
    with pytest.raises(ValueError):
        SearchGateway(producer, "")


def test_gateway_capacity_and_upstream_failure_cleanup():
    gateway = SearchGateway(producer, TOKEN, limit=1)
    assert call(gateway)[0] == 200
    assert call(gateway)[0] == 429
    gateway = SearchGateway(producer, TOKEN)
    gateway.slots.acquire()
    gateway.slots.acquire()
    assert call(gateway)[0] == 429
    gateway.slots.release()
    gateway.slots.release()
    closed = []

    def broken(environ, start):
        start("200 OK", [])
        try:
            yield b"x" * 1048577
        finally:
            closed.append(True)

    gateway.app = broken
    assert call(gateway)[0] == 502
    assert closed == [True]
    assert gateway.slots.acquire(blocking=False)
    assert gateway.slots.acquire(blocking=False)


def test_gateway_all_engine_failure_is_not_empty_success():
    def unavailable(environ, start):
        start("200 OK", [])
        return [b'{"results":[],"unresponsive_engines":[["fixture","blocked"]]}']

    assert call(SearchGateway(unavailable, TOKEN))[0] == 502


def test_private_search_header_and_no_client_secret_exposure(tmp_path, monkeypatch):
    real_client = httpx.AsyncClient
    seen = []

    def handle(request):
        seen.append(request)
        assert request.headers["X-Modax-Search-Token"] == TOKEN
        assert "authorization" not in request.headers and "cookie" not in request.headers
        return httpx.Response(
            200,
            json={
                "results": [{"url": "https://docs.python.org/3/"}],
                "unavailable_engine_count": 2,
            },
        )

    monkeypatch.setattr(
        "modax.research.httpx.AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handle), **kw),
    )
    with TestClient(
        create_app(
            Settings(
                data_dir=tmp_path,
                allow_signup=True,
                searxng_url="https://search.example.org",
                searxng_token=TOKEN,
            )
        )
    ) as client:
        headers = register(client)
        assert (
            client.post(
                "/api/v1/research/search", headers=headers, json={"query": "Python"}
            ).status_code
            == 403
        )
        assert seen == []
        response = client.post(
            "/api/v1/research/search",
            headers=headers,
            json={"query": "Python", "confirm_external_search": True},
        )
        assert response.status_code == 200 and response.json()["partial"] is True
        assert TOKEN not in response.text
        assert TOKEN not in client.get("/api/v1/workspace/capabilities", headers=headers).text
