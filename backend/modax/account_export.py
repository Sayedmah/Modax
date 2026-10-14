"""Bounded owner-only data portability; never exports authentication secrets."""

import asyncio
import json
import tempfile
import threading
import time
import zipfile
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse

MAX_BYTES = 16 * 1024 * 1024
MAX_ROWS = 100000

# Explicit column allowlists are intentional: schema additions must not leak secrets.
COLLECTIONS = {
    "chats": "SELECT id,title,created FROM chats WHERE owner=? ORDER BY created,id",
    "messages": "SELECT m.id,m.chat_id,m.role,m.content,m.model,m.status,m.created FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.owner=? ORDER BY m.created,m.id",
    "tasks": "SELECT id,goal,kind,mode,state,plan,result,created FROM tasks WHERE owner=? ORDER BY created,id",
    "task_steps": "SELECT s.task_id,s.phase,s.status,s.details,s.created FROM task_steps s JOIN tasks t ON t.id=s.task_id WHERE t.owner=? ORDER BY s.id",
    "workspace_files": "SELECT f.task_id,f.path,f.content FROM workspace_files f JOIN tasks t ON t.id=f.task_id WHERE t.owner=? ORDER BY f.task_id,f.path",
    "memory": "SELECT id,content,created FROM memory WHERE owner=? ORDER BY created,id",
    "documents": "SELECT id,filename,kind,content,created FROM documents WHERE owner=? ORDER BY created,id",
    "settings": "SELECT settings FROM user_settings WHERE owner=?",
    "providers": "SELECT id,family,model,base_url,created FROM provider_profiles WHERE owner=? ORDER BY created,id",
    "evaluations": "SELECT id,results,created FROM evaluations WHERE owner=? ORDER BY created,id",
    "usage": "SELECT model,input_tokens,output_tokens,cost,latency_ms,created FROM usage WHERE owner=? ORDER BY created,id",
}


class ExportLimit(ValueError):
    pass


def build_export(store, owner, stop=None):
    deadline = time.monotonic() + 30
    total, rows = 0, 0
    counts = {}

    def check_budget():
        if stop is not None and stop.is_set():
            raise ExportLimit("Account export cancelled")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ExportLimit("Account export time limit reached")
        return remaining

    def encoded(value):
        nonlocal total
        check_budget()
        data = (json.dumps(value, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
        total += len(data)
        if total > MAX_BYTES:
            raise ExportLimit(
                "Account export exceeds 16 MiB; export individual projects/chats instead"
            )
        return data

    with tempfile.SpooledTemporaryFile(max_size=1024 * 1024) as buffer:
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            with store.read_snapshot(check_budget) as db:
                account = db.execute(
                    "SELECT id,username FROM users WHERE id=?", (owner,)
                ).fetchone()
                if not account:
                    raise ExportLimit("Account unavailable")
                archive.writestr("account.json", encoded(dict(account)))
                for name, sql in COLLECTIONS.items():
                    count = 0
                    with archive.open(name + ".ndjson", "w") as member:
                        for row in store.snapshot_rows(db, sql, (owner,), check_budget):
                            rows += 1
                            if rows > MAX_ROWS:
                                raise ExportLimit("Account export record limit reached")
                            member.write(encoded(dict(row)))
                            count += 1
                    counts[name] = count
            manifest = {
                "format": "modax-account-export",
                "version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "counts": counts,
                "excluded": [
                    "provider_credentials",
                    "password_hashes",
                    "sessions",
                    "server_audit_logs",
                    "workspace_snapshot_history",
                    "original_document_binaries",
                ],
                "documents": "extracted text only",
                "restore": "No automatic whole-account restore; chats can use existing chat import",
                "warning": "Private plaintext data. Store securely. Not a substitute for durable server storage.",
            }
            archive.writestr("manifest.json", encoded(manifest))
        buffer.seek(0)
        return buffer.read()


class ExportResponse(StreamingResponse):
    def __init__(self, payload, gate):
        async def chunks():
            for start in range(0, len(payload), 65536):
                yield payload[start : start + 65536]

        super().__init__(
            chunks(),
            media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="modax-account.zip"',
                "Cache-Control": "no-store",
            },
        )
        self.gate = gate

    async def __call__(self, scope, receive, send):
        try:
            async with asyncio.timeout(120):
                await super().__call__(scope, receive, send)
        finally:
            self.gate.release()


def install_account_export(app):
    gate = asyncio.Semaphore(1)

    @app.get("/api/v1/account/export")
    async def export(user=Depends(app.state.owner_dependency)):
        if gate.locked():
            raise HTTPException(429, "Another export is active; try again after it completes")
        await gate.acquire()
        stop = threading.Event()
        worker = asyncio.create_task(asyncio.to_thread(build_export, app.state.store, user, stop))
        try:
            payload = await asyncio.shield(worker)
        except asyncio.CancelledError:
            stop.set()
            while not worker.done():
                try:
                    await asyncio.shield(worker)
                except asyncio.CancelledError:
                    continue
                except Exception:
                    break
            if worker.done() and not worker.cancelled():
                worker.exception()
            gate.release()
            raise
        except ExportLimit as error:
            gate.release()
            raise HTTPException(413, str(error)) from None
        except Exception:
            gate.release()
            raise HTTPException(
                503, "Account export unavailable; no partial archive delivered"
            ) from None
        return ExportResponse(payload, gate)
