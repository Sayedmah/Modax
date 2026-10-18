import pytest
from test_chat import register


def fixture():
    return {
        "name": "Arabic fixture",
        "cases": [{"id": "ar", "task": "Return نعم", "expected": "نعم"}],
    }


def test_immutable_dataset_owner_scope_and_version(client):
    owner, other = register(client), register(client, "other")
    assert client.post("/api/v1/arena/datasets", json=fixture()).status_code == 401
    response = client.post("/api/v1/arena/datasets", headers=owner, json=fixture())
    assert response.status_code == 201, response.text
    data = response.json()
    assert len(data["version"]) == 64 and data["schema_version"] == 1
    assert client.get("/api/v1/arena/datasets", headers=other).json() == []
    path = "/api/v1/arena/datasets/" + data["id"]
    assert client.get(path, headers=other).status_code == 404
    assert client.delete(path, headers=other).status_code == 404
    assert client.put(path, headers=owner, json=fixture()).status_code == 405
    copy = client.post("/api/v1/arena/datasets", headers=owner, json=fixture()).json()
    assert copy["version"] == data["version"] and copy["id"] != data["id"]
    assert client.delete(path, headers=owner).status_code == 204


@pytest.mark.parametrize(
    "change",
    [
        {"cases": []},
        {"name": " "},
        {"cases": [{"id": "bad/path", "task": "x", "expected": "x"}]},
        {"cases": [{"id": "x", "task": "x", "expected": "invalid", "match": "json"}]},
        {"cases": [{"id": "x", "task": "x", "expected": "x"}] * 2},
        {"cases": [{"id": str(i), "task": "x", "expected": "x"} for i in range(11)]},
    ],
)
def test_dataset_validation(client, change):
    owner = register(client)
    body = fixture() | change
    assert client.post("/api/v1/arena/datasets", headers=owner, json=body).status_code == 422
    assert client.get("/api/v1/arena/datasets", headers=owner).json() == []


def test_snapshot_grading_consent_and_retention(client):
    from modax.providers import DemoProvider

    class Controlled(DemoProvider):
        calls = 0

        async def stream_text(self, messages):
            self.calls += 1
            # No expected answer is included in the provider prompt.
            assert "answer-private" not in messages[0]["content"]
            yield '{"ok": true}' if "JSON" in messages[0]["content"] else "answer-private"

    provider = Controlled()
    provider.model.demo = False  # A mock transport marked external to verify the consent boundary.
    client.app.state.registry.providers["controlled"] = provider
    owner, other = register(client), register(client, "other")
    body = {
        "name": "Two cases",
        "cases": [
            {"id": "text", "task": "Return text", "expected": "answer-private"},
            {"id": "structured", "task": "Return JSON", "expected": '{"ok":true}', "match": "json"},
        ],
    }
    data = client.post("/api/v1/arena/datasets", headers=owner, json=body).json()
    run = {"models": ["controlled"], "dataset_id": data["id"]}
    assert client.post("/api/v1/arena/runs", headers=other, json=run).status_code == 404
    assert client.post("/api/v1/arena/runs", headers=owner, json=run).status_code == 403
    assert provider.calls == 0
    response = client.post(
        "/api/v1/arena/runs", headers=owner, json=run | {"confirm_external_calls": True}
    )
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["results"][0]["score"] == 1 and provider.calls == 2
    assert result["dataset_snapshot"]["version"] == data["version"]
    assert result["dataset_snapshot"]["cases"] == data["cases"]
    client.delete("/api/v1/arena/datasets/" + data["id"], headers=owner)
    assert client.get("/api/v1/arena/runs", headers=owner).json()[0] == result
    assert client.get("/api/v1/arena/runs", headers=other).json() == []
    assert client.post("/api/v1/arena/runs", headers=owner, json=run).status_code == 404


def test_secrets_bytes_quota_and_account_export(client):
    import io
    import json
    import zipfile

    owner = register(client)
    body = fixture()
    body["cases"][0]["task"] = "sk-" + "a" * 40
    assert client.post("/api/v1/arena/datasets", headers=owner, json=body).status_code == 422
    body = {
        "name": "Large",
        "cases": [{"id": str(i), "task": "😀" * 2000, "expected": "x"} for i in range(10)],
    }
    assert client.post("/api/v1/arena/datasets", headers=owner, json=body).status_code == 422
    for _ in range(20):
        assert (
            client.post("/api/v1/arena/datasets", headers=owner, json=fixture()).status_code == 201
        )
    assert client.post("/api/v1/arena/datasets", headers=owner, json=fixture()).status_code == 429
    with zipfile.ZipFile(
        io.BytesIO(client.get("/api/v1/account/export", headers=owner).content)
    ) as z:
        assert json.loads(z.read("manifest.json"))["counts"]["arena_datasets"] == 20


def test_run_budget_and_provider_failure_are_explicit(client, monkeypatch):
    from modax import arena_runner
    from modax.providers import DemoProvider, ProviderError

    class Failing(DemoProvider):
        async def stream_text(self, messages):
            raise ProviderError("private diagnostic")
            yield "never"

    owner = register(client)
    client.app.state.registry.providers["failing"] = Failing()
    result = client.post("/api/v1/arena/runs", headers=owner, json={"models": ["failing"]}).json()
    assert result["results"][0]["score"] == 0
    assert "private diagnostic" not in str(result)
    monkeypatch.setattr(arena_runner, "RUN_SECONDS", 0)
    result = client.post("/api/v1/arena/runs", headers=owner, json={"models": ["demo"]}).json()
    assert all(not case["attempted"] for case in result["results"][0]["cases"])


def test_concurrent_arena_runs_are_bounded(client):
    import threading
    from concurrent.futures import ThreadPoolExecutor

    from modax.providers import DemoProvider

    entered, release = threading.Event(), threading.Event()

    class Slow(DemoProvider):
        async def stream_text(self, messages):
            import asyncio

            entered.set()
            await asyncio.to_thread(release.wait, 5)
            yield "response"

    owner = register(client)
    client.app.state.registry.providers["slow"] = Slow()
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(
            client.post, "/api/v1/arena/runs", headers=owner, json={"models": ["slow"]}
        )
        try:
            assert entered.wait(5)
            assert (
                client.post(
                    "/api/v1/arena/runs", headers=owner, json={"models": ["demo"]}
                ).status_code
                == 429
            )
        finally:
            release.set()
        assert pending.result(timeout=10).status_code == 201
    assert (
        client.post("/api/v1/arena/runs", headers=owner, json={"models": ["demo"]}).status_code
        == 201
    )


def test_json_grading_distinguishes_boolean_numbers_and_rejects_nonfinite():
    from modax.arena_datasets import canonical_json

    assert canonical_json('{"b":2,"a":true}') == canonical_json('{"a":true, "b":2}')
    assert canonical_json('{"a":true}') != canonical_json('{"a":1}')
    with pytest.raises(ValueError):
        canonical_json('{"a":NaN}')


def test_concurrent_dataset_quota(client):
    from concurrent.futures import ThreadPoolExecutor

    owner = register(client)
    for _ in range(19):
        assert (
            client.post("/api/v1/arena/datasets", headers=owner, json=fixture()).status_code == 201
        )
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(
            pool.map(
                lambda _: (
                    client.post("/api/v1/arena/datasets", headers=owner, json=fixture()).status_code
                ),
                range(2),
            )
        )
    assert sorted(codes) == [201, 429]


def test_additive_sqlite_upgrade_preserves_existing_users(tmp_path, monkeypatch):
    from modax import store

    migrations = store.MIGRATIONS
    monkeypatch.setattr(store, "MIGRATIONS", migrations[:-1])
    path = tmp_path / "upgrade.sqlite3"
    old = store.Store(path)
    old.execute("INSERT INTO users VALUES(?,?,?)", ("owner", "existing", "test-only-hash"))
    monkeypatch.setattr(store, "MIGRATIONS", migrations)
    upgraded = store.Store(path)
    assert upgraded.query("SELECT username FROM users")[0]["username"] == "existing"
    assert upgraded.query("SELECT id FROM arena_datasets") == []
