import json

import pytest
from modax.account_import import ArchiveError, parse_archive
from test_account_import import archive
from test_chat import register


def notes_zip(notes=None, **extra):
    notes = notes if notes is not None else [{"id": "old-note", "content": "عربي\r\nPreference"}]
    return archive(
        extra={
            "manifest.json": json.dumps(
                {"format": "modax-account-export", "version": 1, "counts": {"memory": len(notes)}}
            ),
            "memory.ndjson": "\n".join(json.dumps(note, ensure_ascii=False) for note in notes),
            **extra,
        }
    )


def restore(client, owner, payload, **data):
    return client.post(
        "/api/v1/account/import-notes",
        headers=owner,
        files={"file": ("notes.zip", payload)},
        data=data,
    )


def test_explicit_confirmation_and_owner_isolated_roundtrip(client):
    source, target = register(client), register(client, "target")
    note = client.post(
        "/api/v1/memory", headers=source, json={"content": "عربي\r\nPreference"}
    ).json()
    client.put("/api/v1/settings", headers=source, json={"use_memory": True})
    payload = client.get("/api/v1/account/export", headers=source).content
    assert restore(client, {}, payload, confirm="true").status_code == 401
    for data in ({}, {"confirm": "false"}):
        assert restore(client, target, payload, **data).status_code == 422
    assert client.get("/api/v1/memory", headers=target).json() == []
    response = restore(client, target, payload, confirm="true")
    assert response.status_code == 201, response.text
    assert response.json()["imported_notes"] == 1
    restored = client.get("/api/v1/memory", headers=target).json()[0]
    assert restored["content"] == note["content"]
    assert restored["id"] != note["id"]
    assert client.delete("/api/v1/memory/" + restored["id"], headers=source).status_code == 404
    assert client.get("/api/v1/settings", headers=target).json()["use_memory"] is False
    assert client.get("/api/v1/chats", headers=target).json() == []
    assert client.get("/api/v1/providers", headers=target).json() == []
    assert restore(client, target, payload, confirm="true").status_code == 201
    assert len(client.get("/api/v1/memory", headers=target).json()) == 2
    client.put("/api/v1/settings", headers=target, json={"use_memory": True})
    assert restore(client, target, payload, confirm="true").status_code == 201
    assert client.get("/api/v1/settings", headers=target).json()["use_memory"] is True


@pytest.mark.parametrize(
    "notes",
    [
        [{"id": "n", "content": ""}],
        [{"id": "n", "content": "   "}],
        [{"id": "n", "content": "a" * 2001}],
        [{"id": 1, "content": "x"}],
        [{"id": "n", "content": "x"}] * 2,
        [{"id": str(i), "content": "x"} for i in range(101)],
    ],
)
def test_invalid_notes_are_rejected(notes):
    with pytest.raises(ArchiveError):
        parse_archive(notes_zip(notes), notes_only=True)


def test_note_parser_ignores_unselected_collections_and_checks_counts():
    payload = notes_zip(**{"chats.ndjson": "{bad", "providers.ndjson": "{bad"})
    assert len(parse_archive(payload, notes_only=True)) == 1
    with pytest.raises(ArchiveError):
        parse_archive(notes_zip(**{"memory.ndjson": ""}), notes_only=True)
    assert len(parse_archive(archive(extra={"memory.ndjson": "{bad"}))) == 1


def test_secret_detection_and_quota_are_atomic(client):
    from modax.workspace import SECRET

    owner = register(client)
    secret = "sk-" + "a" * 48
    assert SECRET.search(secret)
    response = restore(
        client,
        owner,
        notes_zip([{"id": "good", "content": "preference"}, {"id": "bad", "content": secret}]),
        confirm="true",
    )
    assert response.status_code == 422
    assert secret not in response.text
    assert client.get("/api/v1/memory", headers=owner).json() == []
    payload = notes_zip([{"id": str(i), "content": "Preference"} for i in range(100)])
    assert restore(client, owner, payload, confirm="true").status_code == 201
    assert restore(client, owner, notes_zip(), confirm="true").status_code == 429
    assert (
        client.post("/api/v1/memory", headers=owner, json={"content": "extra"}).status_code == 429
    )
    assert len(client.get("/api/v1/memory", headers=owner).json()) == 100


def test_note_limits_and_empty_archive(client):
    owner = register(client)
    for payload in (
        notes_zip([]),
        notes_zip(**{"memory.ndjson": " " * (1024 * 1024 + 1)}),
        notes_zip([{"id": str(i), "content": "😀" * 2000} for i in range(70)]),
        b"x" * (4 * 1024 * 1024 + 1),
    ):
        assert restore(client, owner, payload, confirm="true").status_code == 422
    assert (
        restore(client, owner, b"x" * (4 * 1024 * 1024 + 65537), confirm="true").status_code == 413
    )
    assert client.get("/api/v1/memory", headers=owner).json() == []


def test_database_failure_rolls_back_notes_and_recovers(client, monkeypatch):
    from contextlib import contextmanager

    owner = register(client)
    store = client.app.state.store
    original = store.connect

    @contextmanager
    def failing_connection():
        with original() as db:

            class Connection:
                def execute(self, sql, args=()):
                    if sql.startswith("INSERT INTO audit"):
                        raise RuntimeError("private database diagnostic")
                    return db.execute(sql, args)

            yield Connection()

    monkeypatch.setattr(store, "connect", failing_connection)
    result = restore(client, owner, notes_zip(), confirm="true")
    assert result.status_code == 503
    assert "private database" not in result.text
    monkeypatch.setattr(store, "connect", original)
    assert client.get("/api/v1/memory", headers=owner).json() == []
    assert restore(client, owner, notes_zip(), confirm="true").status_code == 201


def test_concurrent_restore_obeys_owner_quota(client):
    from concurrent.futures import ThreadPoolExecutor

    owner = register(client)
    payload = notes_zip([{"id": str(i), "content": "note"} for i in range(100)])
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(lambda _: restore(client, owner, payload, confirm="true"), range(2))
        )
    assert sorted(response.status_code for response in responses) == [201, 429]
    assert len(client.get("/api/v1/memory", headers=owner).json()) == 100
