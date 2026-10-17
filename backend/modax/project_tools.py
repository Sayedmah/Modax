"""Import a small source-only archive and export a reviewable unified patch."""

import difflib
import io
import json
import stat
import zipfile

from fastapi import Depends, HTTPException, Response, UploadFile

from .workspace import ToolDenied


def import_project(workspace, data):
    if len(data) > 200000:
        raise ToolDenied("Project archive exceeds 200 KB")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if not 1 <= len(entries) <= 64:
                raise ToolDenied("Archive entry limit exceeded")
            files, names, total = [], set(), 0
            for entry in entries:
                if entry.is_dir():
                    continue
                mode = entry.external_attr >> 16
                if entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                    raise ToolDenied("Only stored or deflated source archives supported")
                if stat.S_IFMT(mode) not in {0, stat.S_IFREG} or entry.flag_bits & 1:
                    raise ToolDenied("Linked or encrypted archive entries rejected")
                path = workspace.path(entry.filename).relative_to(workspace.root).as_posix()
                if path in names or entry.file_size > 120000 or len(files) >= 32:
                    raise ToolDenied("Duplicate or oversized project entry")
                names.add(path)
                with archive.open(entry) as source:
                    raw = source.read(120001)
                total += len(raw)
                if total > 120000:
                    raise ToolDenied("Expanded project context exceeds 120 KB")
                files.append({"path": path, "content": raw.decode("utf-8")})
            return workspace.apply(files)
    except (zipfile.BadZipFile, UnicodeError, RuntimeError, NotImplementedError, EOFError):
        raise ToolDenied("Invalid UTF-8 source archive") from None


def workspace_patch(workspace, before):
    after = {name: workspace.read(name) for name in workspace.files()}
    parts = []
    for name in sorted(before.keys() | after.keys()):
        # Preserve final newlines so git apply can handle newline-less source too.
        lines = list(
            difflib.unified_diff(
                before.get(name, "").splitlines(keepends=True),
                after.get(name, "").splitlines(keepends=True),
                fromfile="a/" + name if name in before else "/dev/null",
                tofile="b/" + name if name in after else "/dev/null",
            )
        )
        for line in lines:
            parts.append(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n")
    return "".join(parts)


def install_project_tools(app):
    engine = app.state.task_engine
    require, owner = app.state.require_resource, app.state.owner_dependency

    @app.post("/api/v1/tasks/{task_id}/project", status_code=201)
    async def upload(task_id: str, file: UploadFile, user=Depends(owner)):
        task = require("tasks", user, task_id)
        if task["kind"] != "code" or task["state"] != "READY" or task_id in engine.running:
            raise HTTPException(409, "Project import requires an idle READY code task")
        try:
            data = await file.read(200001)
        finally:
            await file.close()
        # Recheck after upload I/O: another request may have started this task.
        task = require("tasks", user, task_id)
        if task["state"] != "READY" or task_id in engine.running:
            raise HTTPException(409, "Task is no longer idle")
        workspace = engine.workspace(user, task_id)
        snapshot = import_project(workspace, data)
        app.state.store.audit(
            user, "workspace.import", {"task": task_id, "files": workspace.files()}
        )
        return {"snapshot": snapshot, "files": workspace.files()}

    @app.get("/api/v1/tasks/{task_id}/patch")
    async def patch(task_id: str, user=Depends(owner)):
        task = require("tasks", user, task_id)
        if task["state"] in {"RUNNING", "VERIFYING"} or task_id in engine.running:
            raise HTTPException(409, "Wait for worker completion before exporting patch")
        result = json.loads(task["result"] or "{}")
        snapshot = result.get("snapshot")
        rows = app.state.store.query(
            "SELECT files FROM workspace_snapshots WHERE id=? AND task_id=?", (snapshot, task_id)
        )
        if not rows:
            raise HTTPException(409, "No implementation baseline snapshot available")
        text = workspace_patch(engine.workspace(user, task_id), json.loads(rows[0]["files"]))
        return Response(
            text,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="modax-{task_id}.patch"'},
        )
