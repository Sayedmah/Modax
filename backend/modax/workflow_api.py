import json
import time
from typing import Literal

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, Field

from .store import uid
from .tasks import InvalidTransition, TaskEngine
from .workspace import SECRET, ToolDenied


class TaskInput(BaseModel):
    goal: str = Field(min_length=3, max_length=10000)
    kind: Literal["plan", "code", "game"] = "plan"
    mode: Literal["FAST", "SMART", "OMEGA"] = "FAST"


class RunInput(BaseModel):
    model: str = Field(default="auto", max_length=100)
    execute: bool = False
    seed: int = Field(default=42, ge=0, le=2147483647)
    confirm_external_reviews: bool = False


class MemoryInput(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class RollbackInput(BaseModel):
    snapshot: str = Field(pattern=r"^[0-9a-f]{32}$")


def install_workflows(app):
    store, settings, registry = app.state.store, app.state.settings, app.state.registry
    owner, require = app.state.owner_dependency, app.state.require_resource
    engine = TaskEngine(store, settings, registry)
    app.state.task_engine = engine

    @app.exception_handler(InvalidTransition)
    async def invalid_transition(request, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(ToolDenied)
    async def tool_denied(request, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.post("/api/v1/tasks", status_code=201)
    def create(body: TaskInput, user=Depends(owner)):
        if len(store.query("SELECT id FROM tasks WHERE owner=?", (user,))) >= 100:
            raise HTTPException(429, "Task quota reached")
        if not body.goal.strip():
            raise HTTPException(422, "Task goal is empty")
        return engine.create(user, body.goal, body.kind, body.mode)

    @app.get("/api/v1/tasks")
    def tasks(user=Depends(owner)):
        return store.query(
            "SELECT * FROM tasks WHERE owner=? ORDER BY created DESC LIMIT 100", (user,)
        )

    @app.get("/api/v1/tasks/{task_id}")
    def get_task(task_id: str, user=Depends(owner)):
        task = require("tasks", user, task_id)
        task["steps"] = store.query(
            "SELECT phase,status,details,created FROM task_steps WHERE task_id=? ORDER BY id",
            (task_id,),
        )
        return task

    @app.post("/api/v1/tasks/{task_id}/run")
    async def run(task_id: str, body: RunInput, user=Depends(owner)):
        authorize_reviews(task_id, body, user)
        return await engine.run(
            user, task_id, body.model, body.execute, body.seed, body.confirm_external_reviews
        )

    def authorize_reviews(task_id, body, user):
        task = require("tasks", user, task_id)
        if task["kind"] == "code" and task["mode"] != "FAST":
            provider = app.state.user_providers.select(user, body.model, "code")
            if not provider.model.demo and not body.confirm_external_reviews:
                raise HTTPException(
                    422, "SMART/OMEGA extra inference calls require explicit confirmation"
                )

    @app.post("/api/v1/tasks/{task_id}/cancel", status_code=204)
    async def cancel(task_id: str, user=Depends(owner)):
        require("tasks", user, task_id)
        engine.cancel(user, task_id)

    @app.post("/api/v1/tasks/{task_id}/start", status_code=202)
    async def start(task_id: str, body: RunInput, user=Depends(owner)):
        authorize_reviews(task_id, body, user)
        return engine.start(
            user, task_id, body.model, body.execute, body.seed, body.confirm_external_reviews
        )

    @app.post("/api/v1/tasks/{task_id}/resume")
    def resume(task_id: str, user=Depends(owner)):
        require("tasks", user, task_id)
        if task_id in engine.running:
            raise HTTPException(409, "Wait for worker shutdown before resuming")
        engine.transition(user, task_id, "READY")
        return require("tasks", user, task_id)

    @app.post("/api/v1/tasks/{task_id}/rollback")
    async def rollback(task_id: str, body: RollbackInput, user=Depends(owner)):
        task = require("tasks", user, task_id)
        if task["state"] in {"RUNNING", "VERIFYING"} or task_id in engine.running:
            raise HTTPException(409, "Wait for task completion before rollback")
        engine.workspace(user, task_id).rollback(body.snapshot)
        store.audit(user, "workspace.rollback", {"task": task_id, "snapshot": body.snapshot})
        return {"files": engine.workspace(user, task_id).files()}

    @app.get("/api/v1/tasks/{task_id}/files/{path:path}")
    def file(task_id: str, path: str, user=Depends(owner)):
        require("tasks", user, task_id)
        return Response(engine.workspace(user, task_id).read(path), media_type="text/plain")

    @app.get("/api/v1/tasks/{task_id}/download")
    def download(task_id: str, user=Depends(owner)):
        require("tasks", user, task_id)
        return Response(
            engine.workspace(user, task_id).archive(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="modax-{task_id}.zip"'},
        )

    @app.get("/api/v1/memory")
    def memory(user=Depends(owner)):
        return store.query("SELECT * FROM memory WHERE owner=? ORDER BY created", (user,))

    @app.post("/api/v1/memory", status_code=201)
    def add_memory(body: MemoryInput, user=Depends(owner)):
        if SECRET.search(body.content):
            raise HTTPException(422, "Possible secret cannot be stored as ordinary memory")
        mid = uid()
        with store.connect() as db:
            store.lock_user(db, user)
            if (
                db.execute("SELECT COUNT(*) AS n FROM memory WHERE owner=?", (user,)).fetchone()[
                    "n"
                ]
                >= 100
            ):
                raise HTTPException(429, "Memory quota reached")
            db.execute("INSERT INTO memory VALUES(?,?,?,?)", (mid, user, body.content, time.time()))
        return require("memory", user, mid)

    @app.put("/api/v1/memory/{memory_id}")
    def edit_memory(memory_id: str, body: MemoryInput, user=Depends(owner)):
        require("memory", user, memory_id)
        if SECRET.search(body.content):
            raise HTTPException(422, "Possible secret")
        store.execute(
            "UPDATE memory SET content=? WHERE id=? AND owner=?", (body.content, memory_id, user)
        )
        return require("memory", user, memory_id)

    @app.delete("/api/v1/memory/{memory_id}", status_code=204)
    def delete_memory(memory_id: str, user=Depends(owner)):
        require("memory", user, memory_id)
        store.execute("DELETE FROM memory WHERE id=? AND owner=?", (memory_id, user))

    @app.get("/api/v1/memory/export")
    def export_memory(user=Depends(owner)):
        return Response(json.dumps(memory(user), ensure_ascii=False), media_type="application/json")
