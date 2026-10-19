import io
import json
import sqlite3
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor

import pytest
from test_chat import register


def records(archive, name):
    return [json.loads(line) for line in archive.read(name).decode().splitlines()]


def test_account_export_contains_only_owner_data_and_no_auth_credentials(client):
    first = register(client, "export-alice")
    second = register(client, "export-bob")
    for header, text in [(first, "Alice private content"), (second, "Bob private content")]:
        client.post(
            "/api/v1/chats/import",
            headers=header,
            json={"title": text, "messages": [{"role": "user", "content": text}]},
        )
        client.post("/api/v1/memory", headers=header, json={"content": text})
        task = client.post(
            "/api/v1/tasks", headers=header, json={"kind": "code", "goal": text}
        ).json()
        client.app.state.task_engine.workspace(task["owner"], task["id"]).apply(
            [{"path": "source.py", "content": "value = " + repr(text) + "\n"}]
        )
    owner = client.app.state.store.query(
        "SELECT id FROM users WHERE username=?", ("export-alice",)
    )[0]["id"]
    client.app.state.store.execute(
        "INSERT INTO provider_profiles VALUES(?,?,?,?,?,?,?)",
        (
            "profile-fixture",
            owner,
            "compatible",
            "fixture",
            "https://api.openai.com/v1",
            "SECRET_CIPHERTEXT_MUST_NOT_EXPORT",
            1,
        ),
    )
    response = client.get("/api/v1/account/export", headers=first)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "no-store" in response.headers["cache-control"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert records(archive, "messages.ndjson")[0]["content"] == "Alice private content"
        assert len(records(archive, "chats.ndjson")) == 1
        assert len(records(archive, "memory.ndjson")) == 1
        assert len(records(archive, "workspace_files.ndjson")) == 1
        content = b"".join(archive.read(name) for name in archive.namelist()).decode()
        assert "Bob private content" not in content
        account = json.loads(archive.read("account.json"))
        assert set(account) == {"id", "username"}
        assert "SECRET_CIPHERTEXT_MUST_NOT_EXPORT" not in content
        assert "secret" not in records(archive, "providers.ndjson")[0]
        assert first["Authorization"].split(" ")[1] not in content
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["counts"]["messages"] == 1
        assert "provider_credentials" in manifest["excluded"]
    assert client.get("/api/v1/account/export").status_code == 401


def test_export_contains_database_workspace_files_with_exact_newlines(client):
    h = register(client)
    task = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write source"}
    ).json()
    owner = task["owner"]
    workspace = client.app.state.task_engine.workspace(owner, task["id"])
    workspace.apply([{"path": "source.py", "content": "x = 1\r\n"}])
    response = client.get("/api/v1/account/export", headers=h)
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert records(archive, "workspace_files.ndjson")[0]["content"] == "x = 1\r\n"
        assert records(archive, "tasks.ndjson")[0]["id"] == task["id"]


def test_export_limit_is_explicit_and_gate_recovers(client, monkeypatch):
    from modax import account_export

    h = register(client)
    client.post("/api/v1/memory", headers=h, json={"content": "Data to export"})
    with monkeypatch.context() as patch:
        patch.setattr(account_export, "MAX_BYTES", 10)
        response = client.get("/api/v1/account/export", headers=h)
        assert response.status_code == 413
        assert response.headers["content-type"] == "application/json"
    assert client.get("/api/v1/account/export", headers=h).status_code == 200


def test_read_snapshot_is_consistent_and_rejects_writes(client):
    h = register(client)
    store = client.app.state.store
    owner = store.query("SELECT id FROM users WHERE username=?", ("alice",))[0]["id"]
    client.post("/api/v1/memory", headers=h, json={"content": "before"})
    with store.read_snapshot() as db:
        assert (
            db.execute("SELECT COUNT(*) AS n FROM memory WHERE owner=?", (owner,)).fetchone()["n"]
            == 1
        )
        store.execute("INSERT INTO memory VALUES(?,?,?,?)", ("second-note", owner, "after", 1))
        assert (
            db.execute("SELECT COUNT(*) AS n FROM memory WHERE owner=?", (owner,)).fetchone()["n"]
            == 1
        )
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("DELETE FROM memory")
    assert len(store.query("SELECT id FROM memory WHERE owner=?", (owner,))) == 2


def test_concurrent_exports_are_bounded(client, monkeypatch):
    from modax import account_export

    h = register(client)
    entered, finish = threading.Event(), threading.Event()
    original = account_export.build_export

    def slow(store, owner, stop):
        entered.set()
        assert finish.wait(3)
        return original(store, owner, stop)

    monkeypatch.setattr(account_export, "build_export", slow)
    with ThreadPoolExecutor(max_workers=1) as pool:
        response = pool.submit(client.get, "/api/v1/account/export", headers=h)
        try:
            assert entered.wait(3)
            assert client.get("/api/v1/account/export", headers=h).status_code == 429
        finally:
            finish.set()
        assert response.result(timeout=3).status_code == 200


def test_snapshot_progress_handler_interrupts_sql_work(client):
    from modax.account_export import ExportLimit

    def expired():
        raise ExportLimit("Export deadline")

    with client.app.state.store.read_snapshot(expired) as db:
        with pytest.raises(sqlite3.OperationalError, match="interrupted"):
            db.execute(
                "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000000) SELECT SUM(x) FROM n"
            ).fetchone()


def test_postgres_snapshot_fetches_one_server_cursor_row_at_a_time():
    from types import SimpleNamespace

    from modax.postgres import PostgresStore

    fetched = []

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, sql, args):
            assert "owner=%s" in sql and args == ("alice",)

        def fetchmany(self, size):
            assert size == 1
            fetched.append(size)
            return [{"id": "one"}] if len(fetched) == 1 else []

    def cursor(name):
        assert name == "modax_account_export"
        return Cursor()

    timeouts = []
    db = SimpleNamespace(
        connection=SimpleNamespace(cursor=cursor),
        execute=lambda sql, args: timeouts.append(args[0]),
    )
    store = object.__new__(PostgresStore)
    assert list(
        store.snapshot_rows(db, "SELECT id FROM chats WHERE owner=?", ("alice",), lambda: 2)
    ) == [{"id": "one"}]
    assert fetched == [1, 1]
    assert timeouts == ["2000", "2000", "2000"]
