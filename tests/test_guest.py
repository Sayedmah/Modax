from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings


def test_guest_disabled_by_default(client):
    assert client.post("/api/v1/auth/guest").status_code == 403


def test_guest_sessions_are_isolated_and_revocable(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, guest_mode=True))) as client:
        assert client.get("/api/v1/health").json()["guest_mode"] is True
        first = client.post("/api/v1/auth/guest").json()["token"]
        second = client.post("/api/v1/auth/guest").json()["token"]
        a = {"Authorization": "Bearer " + first}
        b = {"Authorization": "Bearer " + second}
        chat = client.post("/api/v1/chats", json={"title": "Private guest"}, headers=a).json()
        assert client.get("/api/v1/chats/" + chat["id"], headers=b).status_code == 404
        assert client.get("/api/v1/chats", headers=b).json() == []
        assert client.get("/api/v1/chats/" + chat["id"], headers=a).status_code == 200
        assert client.post("/api/v1/auth/logout", headers=a).status_code == 204
        assert client.get("/api/v1/models", headers=a).status_code == 401
        assert client.get("/api/v1/models", headers=b).status_code == 200


def test_guest_creation_is_bounded(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, guest_mode=True))) as client:
        for _ in range(10):
            assert client.post("/api/v1/auth/guest").status_code == 201
        assert client.post("/api/v1/auth/guest").status_code == 429
