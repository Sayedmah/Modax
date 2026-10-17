import io
import json
import zipfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

from test_chat import register


def upload(client, owner):
    result = client.post(
        "/api/v1/files",
        headers=owner,
        files={"file": ("private.txt", b"unique_document_text\n" * 100)},
    )
    assert result.status_code == 201, result.text
    return result.json()["id"]


def test_owner_delete_removes_chunks_search_and_export_but_not_history(client):
    owner, other = register(client), register(client, "other")
    fid = upload(client, owner)
    chat = client.post(
        "/api/v1/chats/import",
        headers=owner,
        json={
            "title": "Retained history",
            "messages": [{"role": "assistant", "content": "Past reference to " + fid}],
        },
    ).json()["id"]
    before = client.get("/api/v1/chats/" + chat, headers=owner).json()
    store = client.app.state.store
    assert store.query("SELECT id FROM chunks WHERE document_id=?", (fid,))
    assert client.delete("/api/v1/files/" + fid, headers=other).status_code == 404
    assert client.delete("/api/v1/files/" + fid).status_code == 401
    assert client.delete("/api/v1/files/" + fid, headers=owner).status_code == 204
    assert client.delete("/api/v1/files/" + fid, headers=owner).status_code == 404
    assert not store.query("SELECT id FROM chunks WHERE document_id=?", (fid,))
    assert client.get("/api/v1/files/" + fid, headers=owner).status_code == 404
    assert client.get("/api/v1/files/search?q=unique_document_text", headers=owner).json() == []
    assert client.get("/api/v1/chats/" + chat, headers=owner).json() == before
    with zipfile.ZipFile(
        io.BytesIO(client.get("/api/v1/account/export", headers=owner).content)
    ) as archive:
        assert json.loads(archive.read("manifest.json"))["counts"]["documents"] == 0
    assert (
        client.post(
            "/api/v1/chats/" + chat + "/messages",
            headers=owner,
            json={"content": "use removed attachment", "attachment_ids": [fid]},
        ).status_code
        == 404
    )
    assert client.get("/api/v1/chats/" + chat, headers=owner).json() == before
    audit = store.query("SELECT details FROM audit WHERE action='documents.delete'")
    assert len(audit) == 1 and json.loads(audit[0]["details"]) == {"file_id": fid}


def test_failed_audit_rolls_back_document_and_chunks(client, monkeypatch):
    owner = register(client)
    fid = upload(client, owner)
    store = client.app.state.store
    original = store.connect

    @contextmanager
    def failing_connection():
        with original() as db:

            class Connection:
                def execute(self, sql, args=()):
                    if sql.startswith("INSERT INTO audit"):
                        raise RuntimeError("private diagnostic")
                    return db.execute(sql, args)

            yield Connection()

    monkeypatch.setattr(store, "connect", failing_connection)
    response = client.delete("/api/v1/files/" + fid, headers=owner)
    assert response.status_code == 503 and "private diagnostic" not in response.text
    monkeypatch.setattr(store, "connect", original)
    assert client.get("/api/v1/files/" + fid, headers=owner).status_code == 200
    assert store.query("SELECT id FROM chunks WHERE document_id=?", (fid,))
    assert client.delete("/api/v1/files/" + fid, headers=owner).status_code == 204


def test_concurrent_delete_has_one_success(client):
    owner = register(client)
    fid = upload(client, owner)
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(
            pool.map(
                lambda _: client.delete("/api/v1/files/" + fid, headers=owner).status_code, range(2)
            )
        )
    assert sorted(codes) == [204, 404]
