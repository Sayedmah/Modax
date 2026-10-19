import io
import json
import zipfile

import pytest
from modax.html_forge import html_file
from modax.providers import DemoProvider
from modax.workspace import ToolDenied
from test_chat import register


def test_html_task_download_auth_and_export(client):
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "html", "goal": "Create Arabic page"}
    ).json()["id"]
    assert client.get(f"/api/v1/tasks/{tid}/html", headers=h).status_code == 409
    denied = client.post(
        f"/api/v1/tasks/{tid}/run", headers=h, json={"model": "demo", "execute": True}
    )
    assert denied.status_code == 422
    assert client.get(f"/api/v1/tasks/{tid}", headers=h).json()["state"] == "READY"
    result = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={"model": "demo"}).json()
    assert result["state"] == "COMPLETED", result
    details = json.loads(result["result"])
    assert details["demo"] is True and details["scripts_executed"] is False
    r = client.get(f"/api/v1/tasks/{tid}/html", headers=h)
    assert r.status_code == 200 and r.content.startswith(b"<!doctype html>")
    assert 'attachment; filename="index.html"' == r.headers["content-disposition"]
    assert r.headers["content-type"] == "application/octet-stream"
    assert r.headers["content-security-policy"].startswith("sandbox")
    assert "صفحة اختبار" in r.content.decode()
    z = zipfile.ZipFile(io.BytesIO(client.get(f"/api/v1/tasks/{tid}/download", headers=h).content))
    assert z.read("index.html") == r.content
    other = register(client, "other")
    assert client.get(f"/api/v1/tasks/{tid}/html", headers=other).status_code == 404
    assert client.get(f"/api/v1/tasks/{tid}/html").status_code == 401
    assert (
        client.post(
            "/api/v1/tasks", headers=h, json={"kind": "html", "goal": "page", "mode": "SMART"}
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "raw",
    [
        "not JSON",
        "{}",
        '{"html":"<h1>fragment</h1>"}',
        json.dumps({"html": "x" * 65537}),
        '{"html":null}',
        json.dumps({"html": "sk-" + "a" * 24}),
        '{"html":"", "extra":1}',
    ],
)
def test_invalid_html_rejected(raw):
    with pytest.raises(ToolDenied):
        html_file(raw)


def test_rejected_output_is_not_saved(client, monkeypatch):
    async def invalid(self, messages):
        return '{"html":"<h1>bad</h1>"}'

    monkeypatch.setattr(DemoProvider, "generate_text", invalid)
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "html", "goal": "Build page"}
    ).json()["id"]
    r = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={"model": "demo"}).json()
    assert r["state"] == "BLOCKED"
    assert client.get(f"/api/v1/tasks/{tid}/html", headers=h).status_code == 409
    assert (
        client.app.state.store.query("SELECT * FROM workspace_files WHERE task_id=?", (tid,)) == []
    )


def test_inline_script_is_data_not_executed():
    source = '<!doctype html><html><head><title>Example</title></head><body><script>throw Error("must not execute")</script></body></html>'
    assert html_file(json.dumps({"html": source}))["content"] == source


def test_selected_provider_receives_goal_and_custom_html_is_preserved(client, monkeypatch):
    seen = []
    source = '<!doctype html><html lang="ar"><head><title>متجري</title></head><body><h1>منتجاتي</h1></body></html>'

    async def custom(self, messages):
        seen.extend(messages)
        return json.dumps({"html": source})

    monkeypatch.setattr(DemoProvider, "generate_text", custom)
    h = register(client)
    task = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "html", "goal": "أنشئ متجري"}
    ).json()
    r = client.post(f"/api/v1/tasks/{task['id']}/run", headers=h, json={"model": "demo"})
    assert r.json()["state"] == "COMPLETED"
    assert seen[0]["content"].startswith("MODAX_HTML_JSON")
    assert seen[1]["content"] == "أنشئ متجري"
    assert client.get(f"/api/v1/tasks/{task['id']}/html", headers=h).content.decode() == source
