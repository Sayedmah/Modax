import asyncio
import json
import threading

from modax.config import Settings
from modax.providers import DemoProvider, Registry
from modax.store import Store, uid
from modax.tasks import InvalidTransition, TaskEngine
from test_chat import register


def test_background_task_accepts_once_and_can_be_cancelled(tmp_path):
    async def scenario():
        store = Store(tmp_path / "db.sqlite3")
        user = uid()
        store.execute("INSERT INTO users VALUES(?,?,?)", (user, "alice", "unused"))
        settings = Settings(data_dir=tmp_path)
        registry = Registry(settings)
        entered = asyncio.Event()

        class WaitingProvider(DemoProvider):
            async def generate_text(self, messages):
                entered.set()
                await asyncio.Event().wait()

        registry.providers["demo"] = WaitingProvider()
        engine = TaskEngine(store, settings, registry)
        task = engine.create(user, "Write Python", "code")
        accepted = engine.start(user, task["id"], "demo")
        assert accepted["state"] == "RUNNING"
        await asyncio.wait_for(entered.wait(), 2)
        try:
            engine.start(user, task["id"], "demo")
            assert False, "Duplicate execution accepted"
        except InvalidTransition:
            pass
        worker = engine.running[task["id"]]
        engine.cancel(user, task["id"])
        await asyncio.gather(worker, return_exceptions=True)
        assert store.require("tasks", user, task["id"])["state"] == "CANCELLED"
        assert not engine.running

    asyncio.run(scenario())


def test_background_api_and_owner_isolation(client):
    h = register(client)
    task = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write greeting"}
    ).json()
    other = register(client, "other-user")
    endpoint = f"/api/v1/tasks/{task['id']}/start"
    assert client.post(endpoint, headers=other, json={}).status_code == 404
    response = client.post(endpoint, headers=h, json={"model": "demo"})
    assert response.status_code == 202
    # The TestClient event loop stays alive while the detached worker runs.
    for _ in range(100):
        result = client.get(f"/api/v1/tasks/{task['id']}", headers=h).json()
        if result["state"] == "COMPLETED":
            break
    assert result["state"] == "COMPLETED", result
    assert json.loads(result["result"])["syntax_checked"] is True
    assert client.post(endpoint, headers=h, json={}).status_code == 409


def test_runtime_cancellation_keeps_slot_until_worker_cleanup(tmp_path, monkeypatch):
    from modax.workspace import DatabaseWorkspace, ToolDenied

    entered = threading.Event()
    finish_cleanup = threading.Event()

    def runtime(self, enabled, image, cancel_event=None):
        entered.set()
        assert cancel_event.wait(3)
        assert finish_cleanup.wait(3)
        raise ToolDenied("Command cancelled")

    monkeypatch.setattr(DatabaseWorkspace, "run_tests", runtime)

    async def scenario():
        store = Store(tmp_path / "db.sqlite3")
        user = uid()
        store.execute("INSERT INTO users VALUES(?,?,?)", (user, "alice", "unused"))
        settings = Settings(data_dir=tmp_path)
        engine = TaskEngine(store, settings, Registry(settings))
        task = engine.create(user, "Write code", "code", "FAST")
        engine.start(user, task["id"], "demo", True)
        assert await asyncio.to_thread(entered.wait, 3)
        worker = engine.running[task["id"]]
        engine.cancel(user, task["id"])
        await asyncio.sleep(0.05)
        assert task["id"] in engine.running
        assert task["id"] in engine.active_owners
        assert not worker.done()
        worker.cancel()  # A second cancellation must not abandon thread cleanup.
        await asyncio.sleep(0.05)
        assert not worker.done() and task["id"] in engine.active_owners
        finish_cleanup.set()
        await asyncio.gather(worker, return_exceptions=True)
        assert not engine.running and not engine.active_owners
        assert store.require("tasks", user, task["id"])["state"] == "CANCELLED"

    asyncio.run(scenario())
