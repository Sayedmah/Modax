import json
from dataclasses import replace

import pytest
from modax.providers import DemoProvider
from test_chat import register


@pytest.mark.parametrize("mode,count", [("FAST", 0), ("SMART", 1), ("OMEGA", 2)])
def test_modes_persist_separate_review_artifacts(client, mode, count):
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write greeting", "mode": mode}
    ).json()["id"]
    task = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={"model": "demo"}).json()
    assert task["state"] == "COMPLETED"
    result = json.loads(task["result"])
    assert len(result["reviews"]) == count
    assert all(review["demo"] for review in result["reviews"])
    stored = client.get(f"/api/v1/tasks/{tid}", headers=h).json()
    assert len([step for step in stored["steps"] if step["phase"] == "REVIEW"]) == count


def test_critical_review_blocks_completion_and_preserves_files(client):
    class Rejecting(DemoProvider):
        async def stream_text(self, messages):
            if messages[0]["content"].startswith("MODAX_REVIEW_JSON"):
                # Reviewer receives artifacts, not the implementation conversation.
                assert len(messages) == 2
                assert "test_hello.py" in messages[1]["content"]
                yield json.dumps(
                    {
                        "approved": True,
                        "findings": [
                            {
                                "severity": "critical",
                                "path": "hello.py",
                                "message": "Test rejection",
                            }
                        ],
                    }
                )
            else:
                async for chunk in super().stream_text(messages):
                    yield chunk

    client.app.state.registry.providers["demo"] = Rejecting()
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write greeting", "mode": "OMEGA"}
    ).json()["id"]
    task = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={}).json()
    assert task["state"] == "BLOCKED"
    assert client.get(f"/api/v1/tasks/{tid}/files/hello.py", headers=h).status_code == 200
    assert json.loads(task["result"])["reviews"][0]["approved"] is False


def test_external_reviews_require_confirmation_before_execution(client):
    provider = DemoProvider()
    provider.model = replace(provider.model, demo=False)
    client.app.state.registry.providers["demo"] = provider
    h = register(client)
    task = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write greeting", "mode": "OMEGA"}
    ).json()
    tid = task["id"]
    assert (
        client.post(f"/api/v1/tasks/{tid}/start", headers=h, json={"model": "demo"}).status_code
        == 422
    )
    assert client.get(f"/api/v1/tasks/{tid}", headers=h).json()["state"] == "READY"
    result = client.post(
        f"/api/v1/tasks/{tid}/run",
        headers=h,
        json={"model": "demo", "confirm_external_reviews": True},
    ).json()
    assert result["state"] == "COMPLETED"


def test_changed_auto_provider_cannot_bypass_review_consent(client, monkeypatch):
    demo = DemoProvider()
    external = DemoProvider()
    external.model = replace(external.model, demo=False)
    calls = []

    async def should_not_generate(messages):
        calls.append(messages)
        raise AssertionError("Unauthorized inference")

    external.generate_text = should_not_generate
    selections = iter([demo, external])
    monkeypatch.setattr(client.app.state.user_providers, "select", lambda *args: next(selections))
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Write greeting", "mode": "SMART"}
    ).json()["id"]
    result = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={}).json()
    assert result["state"] == "BLOCKED"
    assert calls == []
