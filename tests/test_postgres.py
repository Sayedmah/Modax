import os
import uuid

import pytest


def test_genuine_postgres_migrations_auth_documents_and_tasks(tmp_path):
    url = os.getenv("MODAX_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Dedicated PostgreSQL integration URL not configured")
    import psycopg
    from fastapi.testclient import TestClient
    from modax.api import create_app
    from modax.config import Settings
    from psycopg import sql
    from psycopg.conninfo import make_conninfo
    from test_chat import register

    schema = "test_" + uuid.uuid4().hex
    with psycopg.connect(url, autocommit=True) as c:
        c.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    scoped = make_conninfo(url, options="-c search_path=" + schema)
    try:
        settings = Settings(
            data_dir=tmp_path, database_url=scoped, allow_signup=True, guest_mode=True
        )
        with TestClient(create_app(settings)) as c:
            h = register(c)
            assert (
                c.post(
                    "/api/v1/auth/register",
                    json={"username": "alice", "password": "a-secure-password-123"},
                ).status_code
                == 409
            )
            cid = c.post("/api/v1/chats", headers=h, json={}).json()["id"]
            guest = c.post("/api/v1/auth/guest")
            assert guest.status_code == 201, guest.text
            guest_headers = {"Authorization": "Bearer " + guest.json()["token"]}
            assert c.get(f"/api/v1/chats/{cid}", headers=guest_headers).status_code == 404
            assert c.get("/api/v1/models", headers=guest_headers).status_code == 200
            assert (
                "event: done"
                in c.post(
                    f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "hello"}
                ).text
            )
            task = c.post(
                "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Create Python code"}
            ).json()
            assert (
                c.post(f"/api/v1/tasks/{task['id']}/run", headers=h, json={}).json()["state"]
                == "COMPLETED"
            )
            assert (
                c.post(
                    "/api/v1/files",
                    headers=h,
                    files={"file": ("notes.txt", b"Persistent document")},
                ).status_code
                == 201
            )
            note = c.post("/api/v1/memory", headers=h, json={"content": "Portable note"}).json()
            dataset = c.post(
                "/api/v1/arena/datasets",
                headers=h,
                json={
                    "name": "PG fixture",
                    "cases": [{"id": "one", "task": "Return MODAX", "expected": "MODAX"}],
                },
            ).json()
        with TestClient(create_app(settings)) as c:
            assert len(c.get(f"/api/v1/chats/{cid}", headers=h).json()["messages"]) == 2
            assert len(c.get("/api/v1/files", headers=h).json()) == 1
            dataset_path = "/api/v1/arena/datasets/" + dataset["id"]
            assert c.get(dataset_path, headers=h).json()["version"] == dataset["version"]
            assert c.get(dataset_path, headers=guest_headers).status_code == 404
            run = c.post(
                "/api/v1/arena/runs",
                headers=h,
                json={"models": ["demo"], "dataset_id": dataset["id"]},
            )
            assert run.status_code == 201, run.text
            assert run.json()["dataset_snapshot"]["version"] == dataset["version"]
            assert run.json()["results"][0]["score"] == 0
            import io
            import json
            import zipfile

            exported = c.get("/api/v1/account/export", headers=h)
            assert exported.status_code == 200, exported.text
            with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                assert manifest["counts"]["documents"] == 1
                assert manifest["counts"]["tasks"] == 1
                assert manifest["counts"]["arena_datasets"] == 1
            restored = c.post(
                "/api/v1/account/import-chats",
                headers=guest_headers,
                files={"file": ("account.zip", exported.content)},
            )
            assert restored.status_code == 201, restored.text
            restored_id = restored.json()["chats"][0]["id"]
            assert restored_id != cid
            assert (
                len(c.get(f"/api/v1/chats/{restored_id}", headers=guest_headers).json()["messages"])
                == 2
            )
            assert c.get(f"/api/v1/chats/{restored_id}", headers=h).status_code == 404
            note_restore = c.post(
                "/api/v1/account/import-notes",
                headers=guest_headers,
                files={"file": ("account.zip", exported.content)},
                data={"confirm": "true"},
            )
            assert note_restore.status_code == 201, note_restore.text
            assert note_restore.json()["imported_notes"] == 1
            notes = c.get("/api/v1/memory", headers=guest_headers).json()
            assert notes[0]["content"] == note["content"]
            assert notes[0]["id"] != note["id"]
            assert c.get("/api/v1/settings", headers=guest_headers).json()["use_memory"] is False
            assert c.delete("/api/v1/memory/" + notes[0]["id"], headers=h).status_code == 404
            fid = c.get("/api/v1/files", headers=h).json()[0]["id"]
            assert c.delete("/api/v1/files/" + fid, headers=guest_headers).status_code == 404
            assert c.delete("/api/v1/files/" + fid, headers=h).status_code == 204
            assert c.delete("/api/v1/files/" + fid, headers=h).status_code == 404
            assert not c.app.state.store.query("SELECT id FROM chunks WHERE document_id=?", (fid,))
            assert c.get("/api/v1/files/search?q=Persistent", headers=h).json() == []
            assert (
                c.post(
                    f"/api/v1/chats/{cid}/messages",
                    headers=h,
                    json={"content": "deleted attachment", "attachment_ids": [fid]},
                ).status_code
                == 404
            )
            assert len(c.get(f"/api/v1/chats/{cid}", headers=h).json()["messages"]) == 2
            assert c.delete(dataset_path, headers=h).status_code == 204
            assert (
                c.get("/api/v1/arena/runs", headers=h).json()[0]["dataset_snapshot"]["version"]
                == dataset["version"]
            )
    finally:
        with psycopg.connect(url, autocommit=True) as c:
            c.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
