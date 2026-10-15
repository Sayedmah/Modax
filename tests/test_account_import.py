import io
import json
import zipfile

import pytest
from modax.account_import import ArchiveError, parse_archive
from test_chat import register


def archive(chats=None, messages=None, extra=None):
    chats = chats if chats is not None else [{"id": "old-chat", "title": "العربية"}]
    messages = (
        messages
        if messages is not None
        else [
            {
                "id": "old-message",
                "chat_id": "old-chat",
                "role": "user",
                "content": "hello\r\n",
                "status": "completed",
            }
        ]
    )
    files = {
        "manifest.json": json.dumps(
            {
                "format": "modax-account-export",
                "version": 1,
                "counts": {"chats": len(chats), "messages": len(messages)},
            }
        ),
        "chats.ndjson": "\n".join(map(json.dumps, chats)),
        "messages.ndjson": "\n".join(map(json.dumps, messages)),
    }
    files.update(extra or {})
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zipped:
        for name, content in files.items():
            zipped.writestr(name, content)
    return buffer.getvalue()


def test_parse_preserves_text_and_ignores_other_collections():
    result = parse_archive(archive(extra={"providers.ndjson": '{"secret":"never-restore"}'}))
    assert result[0]["title"] == "العربية"
    assert result[0]["messages"][0].content == "hello\r\n"


@pytest.mark.parametrize(
    "extra",
    [
        {"../escape": "bad"},
        {"manifest.json": "{}"},
        {"messages.ndjson": "{bad"},
        {"messages.ndjson": ""},
    ],
)
def test_corrupt_archive_is_rejected(extra):
    with pytest.raises(ArchiveError):
        parse_archive(archive(extra=extra))


def test_orphans_and_limits_are_rejected():
    with pytest.raises(ArchiveError):
        parse_archive(archive(chats=[]))
    with pytest.raises(ArchiveError):
        parse_archive(archive(chats=[{"id": str(i), "title": "t"} for i in range(51)], messages=[]))
    with pytest.raises(ArchiveError):
        parse_archive(b"x" * (4 * 1024 * 1024 + 1))


def test_real_export_round_trip_into_another_owner(client):
    original = register(client)
    source = client.post(
        "/api/v1/chats/import",
        headers=original,
        json={
            "title": "عربي",
            "messages": [
                {"role": "user", "content": "a\r\nb"},
                {"role": "assistant", "content": "answer"},
            ],
        },
    ).json()
    exported = client.get("/api/v1/account/export", headers=original).content
    target = register(client, "restored")
    result = client.post(
        "/api/v1/account/import-chats", headers=target, files={"file": ("account.zip", exported)}
    )
    assert result.status_code == 201, result.text
    restored_id = result.json()["chats"][0]["id"]
    assert restored_id != source["id"]
    restored = client.get("/api/v1/chats/" + restored_id, headers=target).json()
    assert [m["content"] for m in restored["messages"]] == ["a\r\nb", "answer"]
    assert all(m["model"] == "imported" for m in restored["messages"])
    assert client.get("/api/v1/chats/" + restored_id, headers=original).status_code == 404
    assert client.get("/api/v1/providers", headers=target).json() == []
    repeated = client.post(
        "/api/v1/account/import-chats", headers=target, files={"file": ("account.zip", exported)}
    )
    assert repeated.status_code == 201
    assert repeated.json()["chats"][0]["id"] != restored_id
    assert len(client.get("/api/v1/chats", headers=target).json()) == 2
    assert (
        client.post("/api/v1/account/import-chats", files={"file": ("a.zip", exported)}).status_code
        == 401
    )


def test_invalid_batch_is_atomic_and_running_is_not_resumed(client):
    owner = register(client)
    bad = archive(
        messages=[
            {
                "id": "m",
                "chat_id": "missing",
                "role": "user",
                "content": "hello",
                "status": "completed",
            }
        ]
    )
    assert (
        client.post(
            "/api/v1/account/import-chats", headers=owner, files={"file": ("a.zip", bad)}
        ).status_code
        == 422
    )
    assert client.get("/api/v1/chats", headers=owner).json() == []
    payload = archive(
        messages=[
            {
                "id": "m",
                "chat_id": "old-chat",
                "role": "assistant",
                "content": "",
                "status": "running",
            }
        ]
    )
    result = client.post(
        "/api/v1/account/import-chats", headers=owner, files={"file": ("a.zip", payload)}
    )
    assert result.status_code == 201
    assert result.json()["interrupted_messages"] == 1
    chat = client.get("/api/v1/chats/" + result.json()["chats"][0]["id"], headers=owner).json()
    assert chat["messages"][0]["status"] == "interrupted"


def test_database_failure_rolls_back_and_gate_recovers(client, monkeypatch):
    from contextlib import contextmanager

    owner = register(client)
    store = client.app.state.store
    original = store.connect

    @contextmanager
    def failing_connection():
        with original() as db:

            class Connection:
                def execute(self, sql, args=()):
                    if sql.startswith("INSERT INTO messages"):
                        raise RuntimeError("private diagnostic must not leak")
                    return db.execute(sql, args)

            yield Connection()

    monkeypatch.setattr(store, "connect", failing_connection)
    result = client.post(
        "/api/v1/account/import-chats", headers=owner, files={"file": ("a.zip", archive())}
    )
    assert result.status_code == 503
    assert "private diagnostic" not in result.text
    monkeypatch.setattr(store, "connect", original)
    assert client.get("/api/v1/chats", headers=owner).json() == []
    assert (
        client.post(
            "/api/v1/account/import-chats", headers=owner, files={"file": ("a.zip", archive())}
        ).status_code
        == 201
    )


def test_collection_limits_and_metadata_are_not_restored(client):
    owner = register(client)
    payload = archive(
        extra={
            "providers.ndjson": '{"secret":"do-not-restore"}',
            "account.json": '{"id":"foreign"}',
            "usage.ndjson": '{"cost":1000}',
        }
    )
    assert (
        client.post(
            "/api/v1/account/import-chats", headers=owner, files={"file": ("a.zip", payload)}
        ).status_code
        == 201
    )
    store = client.app.state.store
    assert store.query("SELECT * FROM provider_profiles") == []
    assert store.query("SELECT * FROM usage") == []
    assert len(store.query("SELECT * FROM users")) == 1
    messages = [
        {"id": str(i), "chat_id": "old-chat", "role": "user", "content": "x", "status": "completed"}
        for i in range(101)
    ]
    with pytest.raises(ArchiveError, match="Per-chat"):
        parse_archive(archive(messages=messages))
    with pytest.raises(ArchiveError, match="Expanded archive"):
        parse_archive(archive(extra={"documents.ndjson": "x" * (16 * 1024 * 1024)}))


def test_oversize_body_and_duplicate_ids_are_rejected(client):
    owner = register(client)
    assert (
        client.post(
            "/api/v1/account/import-chats", headers=owner, content=b"x" * (4 * 1024 * 1024 + 65537)
        ).status_code
        == 413
    )
    with pytest.raises(ArchiveError, match="Duplicate"):
        parse_archive(
            archive(chats=[{"id": "old-chat", "title": "a"}, {"id": "old-chat", "title": "b"}])
        )


def test_larger_valid_zip_and_quota(client):
    owner = register(client)
    payload = archive(extra={"documents.ndjson": "x" * 300000})
    with zipfile.ZipFile(io.BytesIO(payload)) as source:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as expanded:
            for name in source.namelist():
                expanded.writestr(name, source.read(name))
    assert (
        client.post(
            "/api/v1/account/import-chats",
            headers=owner,
            files={"file": ("a.zip", buffer.getvalue())},
        ).status_code
        == 201
    )
    store = client.app.state.store
    user = store.query("SELECT id FROM users")[0]["id"]
    with store.connect() as db:
        for i in range(999):
            db.execute(
                "INSERT INTO chats VALUES(?,?,?,?)", ("quota-" + str(i), user, "existing", i)
            )
    assert (
        client.post(
            "/api/v1/account/import-chats", headers=owner, files={"file": ("a.zip", archive())}
        ).status_code
        == 429
    )
    assert store.query("SELECT COUNT(*) AS n FROM chats")[0]["n"] == 1000
