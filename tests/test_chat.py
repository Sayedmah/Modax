from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings


def register(client, name="alice"):
    r = client.post(
        "/api/v1/auth/register", json={"username": name, "password": "a-secure-password-123"}
    )
    assert r.status_code == 201, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_auth_and_explicit_demo(client):
    assert client.get("/api/v1/chats").status_code == 401
    h = register(client)
    assert client.get("/api/v1/models", headers=h).json()[0]["demo"] is True
    assert (
        client.post(
            "/api/v1/auth/login", json={"username": "alice", "password": "wrong"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/register", json={"username": "alice", "password": "a-secure-password-123"}
        ).status_code
        == 409
    )
    assert client.post("/api/v1/auth/logout", headers=h).status_code == 204
    assert client.get("/api/v1/chats", headers=h).status_code == 401


def test_stream_history_and_owner(client):
    h = register(client)
    chat = client.post("/api/v1/chats", headers=h, json={"title": "مرحبا"}).json()
    r = client.post(
        f"/api/v1/chats/{chat['id']}/messages",
        headers=h,
        json={"content": "مرحبا", "model": "demo"},
    )
    assert r.status_code == 200
    assert "event: delta" in r.text and "event: done" in r.text
    messages = client.get(f"/api/v1/chats/{chat['id']}", headers=h).json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert "DEMO" in messages[1]["content"]
    assert messages[1]["status"] == "completed"
    other = register(client, "bob")
    assert client.get(f"/api/v1/chats/{chat['id']}", headers=other).status_code == 404
    assert (
        client.post(
            f"/api/v1/chats/{chat['id']}/messages", headers=other, json={"content": "x"}
        ).status_code
        == 404
    )
    assert len(client.get("/api/v1/chats", headers=other).json()) == 0


def test_unknown_model_and_limits(client):
    h = register(client)
    cid = client.post("/api/v1/chats", headers=h, json={"title": "test"}).json()["id"]
    assert (
        client.post(
            f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "hi", "model": "fake"}
        ).status_code
        == 422
    )
    assert (
        client.post(f"/api/v1/chats/{cid}/messages", headers=h, json={"content": " "}).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "a" * 20001}
        ).status_code
        == 422
    )
    assert client.get(f"/api/v1/chats/{cid}", headers=h).json()["messages"] == []


def test_persistence_and_no_plaintext_secrets(tmp_path):
    settings = Settings(data_dir=tmp_path, allow_signup=True)
    with TestClient(create_app(settings)) as c:
        h = register(c)
        cid = c.post("/api/v1/chats", headers=h, json={"title": "persist"}).json()["id"]
        c.post(f"/api/v1/chats/{cid}/messages", headers=h, json={"content": "hi"})
    with TestClient(create_app(settings)) as c:
        assert len(c.get(f"/api/v1/chats/{cid}", headers=h).json()["messages"]) == 2
    data = (tmp_path / "modax.sqlite3").read_bytes()
    assert b"a-secure-password-123" not in data
    assert h["Authorization"].split()[1].encode() not in data


def test_signup_disabled(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as c:
        assert (
            c.post(
                "/api/v1/auth/register",
                json={"username": "alice", "password": "a-secure-password-123"},
            ).status_code
            == 403
        )


def test_console_is_served(client):
    assert client.get("/").status_code == 200
    assert "MODAX" in client.get("/").text
