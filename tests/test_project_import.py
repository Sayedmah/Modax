import io
import json
import subprocess
import zipfile

import pytest
from modax.project_tools import workspace_patch
from modax.providers import DemoProvider
from modax.workspace import Workspace
from test_chat import register


def archive(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as source:
        for path, text in files.items():
            source.writestr(path, text)
    return output.getvalue()


def test_imported_project_is_inspected_and_patch_is_reviewable(client):
    class ProjectProvider(DemoProvider):
        async def stream_text(self, messages):
            assert '"src/main.py"' in messages[-1]["content"]
            assert "return 1" in messages[-1]["content"]
            yield json.dumps(
                {"files": [{"path": "src/main.py", "content": "def result():\n    return 2\n"}]}
            )

    client.app.state.registry.providers["demo"] = ProjectProvider()
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Change result to two"}
    ).json()["id"]
    upload = client.post(
        f"/api/v1/tasks/{tid}/project",
        headers=h,
        files={
            "file": (
                "project.zip",
                archive({"src/main.py": "def result():\n    return 1\n"}),
                "application/zip",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["files"] == ["src/main.py"]
    task = client.post(f"/api/v1/tasks/{tid}/run", headers=h, json={}).json()
    assert task["state"] == "COMPLETED", task
    patch = client.get(f"/api/v1/tasks/{tid}/patch", headers=h)
    assert patch.status_code == 200
    assert "--- a/src/main.py" in patch.text and "+++ b/src/main.py" in patch.text
    assert "-    return 1" in patch.text and "+    return 2" in patch.text
    other = register(client, "other")
    assert client.get(f"/api/v1/tasks/{tid}/patch", headers=other).status_code == 404


@pytest.mark.parametrize(
    "path", ["../escape.py", ".env", "folder/.git/config", "binary.exe", "a\nb.py"]
)
def test_unsafe_project_archive_is_rejected_atomically(client, path):
    h = register(client)
    tid = client.post(
        "/api/v1/tasks", headers=h, json={"kind": "code", "goal": "Inspect project"}
    ).json()["id"]
    r = client.post(
        f"/api/v1/tasks/{tid}/project",
        headers=h,
        files={"file": ("bad.zip", archive({"good.py": "x=1", path: "x=1"}), "application/zip")},
    )
    assert r.status_code == 422, r.text
    assert client.get(f"/api/v1/tasks/{tid}/files/good.py", headers=h).status_code == 422


def test_patch_applies_to_existing_and_new_source_with_no_final_newline(tmp_path):
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    (baseline / "main.py").write_text("x = 1")
    workspace = Workspace(tmp_path / "edited")
    workspace.apply(
        [{"path": "main.py", "content": "x = 2"}, {"path": "new.py", "content": "y = 3"}]
    )
    patch = workspace_patch(workspace, {"main.py": "x = 1"})
    result = subprocess.run(
        ["git", "apply", "--check", "-"], input=patch, text=True, cwd=baseline, capture_output=True
    )
    assert result.returncode == 0, result.stderr
    applied = subprocess.run(
        ["git", "apply", "-"], input=patch, text=True, cwd=baseline, capture_output=True
    )
    assert applied.returncode == 0, applied.stderr
    assert (baseline / "main.py").read_text() == "x = 2"
    assert (baseline / "new.py").read_text() == "y = 3"


def test_expanded_archive_limit_and_symlink_rejected(tmp_path):
    from modax.project_tools import import_project
    from modax.workspace import ToolDenied

    workspace = Workspace(tmp_path / "project")
    large = io.BytesIO()
    with zipfile.ZipFile(large, "w", compression=zipfile.ZIP_DEFLATED) as source:
        source.writestr("large.txt", "x" * 120001)
    with pytest.raises(ToolDenied, match="oversized"):
        import_project(workspace, large.getvalue())
    linked = io.BytesIO()
    with zipfile.ZipFile(linked, "w") as source:
        entry = zipfile.ZipInfo("link.py")
        entry.external_attr = 0o120777 << 16
        source.writestr(entry, "../outside.py")
    with pytest.raises(ToolDenied, match="Linked"):
        import_project(workspace, linked.getvalue())
    assert workspace.files() == []


def test_patch_applies_to_original_crlf_baseline(tmp_path):
    from modax.project_tools import import_project

    original = "def result():\r\n    return 1\r\n"
    workspace = Workspace(tmp_path / "workspace")
    import_project(workspace, archive({"main.py": original}))
    before = {"main.py": workspace.read("main.py")}
    workspace.apply([{"path": "main.py", "content": "def result():\r\n    return 2\r\n"}])
    patch = workspace_patch(workspace, before)
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    (baseline / "main.py").write_bytes(original.encode())
    result = subprocess.run(
        ["git", "apply", "--check", "-"], input=patch.encode(), cwd=baseline, capture_output=True
    )
    assert result.returncode == 0, result.stderr
