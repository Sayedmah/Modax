"""Run only on a dedicated disposable Docker host, never in the public MODAX API."""

import asyncio
import hmac
import json
import os
import re
import tempfile
import threading
import time
from collections import deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request

from .workspace import ToolDenied, Workspace


def create_worker(token=None, image=None):
    token = token if token is not None else os.getenv("MODAX_SANDBOX_TOKEN", "")
    image = image if image is not None else os.getenv("MODAX_TEST_IMAGE", "")
    if len(token) < 32 or not re.fullmatch(r"[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}", image):
        raise ValueError("Dedicated worker requires a strong token and approved immutable image")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    slot, lock, hits = threading.BoundedSemaphore(1), threading.Lock(), deque()

    @app.get("/health")
    def health():
        return {"service": "MODAX Docker sandbox", "status": "configured", "runtime_probe": False}

    @app.post("/v1/test")
    async def test(request: Request):
        supplied = request.headers.get("X-Modax-Sandbox-Token", "")
        if not hmac.compare_digest(supplied.encode(), token.encode()):
            raise HTTPException(401, "Unauthorized")
        with lock:
            now = time.monotonic()
            while hits and hits[0] < now - 60:
                hits.popleft()
            if len(hits) >= 10:
                raise HTTPException(429, "Sandbox request budget reached")
            hits.append(now)
        if not slot.acquire(blocking=False):
            raise HTTPException(429, "Sandbox busy")
        try:
            raw = bytearray()
            async for block in request.stream():
                raw.extend(block)
                if len(raw) > 262144:
                    raise HTTPException(413, "Source request too large")
            try:
                body = json.loads(raw)
                if not isinstance(body, dict) or set(body) != {"files"}:
                    raise ValueError()
                files = body["files"]
                if not isinstance(files, list) or not 1 <= len(files) <= 32:
                    raise ValueError()
                if sum(len(x["content"].encode()) for x in files) > 120000:
                    raise ValueError()
                with tempfile.TemporaryDirectory(prefix="modax-sandbox-") as directory:
                    workspace = Workspace(Path(directory) / "source")
                    workspace.apply(files)
                    # Shield and drain: disconnect/cancellation must not release the slot
                    # or remove staging while the bounded Docker operation still runs.
                    worker = asyncio.create_task(
                        asyncio.to_thread(workspace.run_tests, True, image)
                    )
                    try:
                        return await asyncio.shield(worker)
                    except asyncio.CancelledError:
                        while not worker.done():
                            try:
                                await asyncio.shield(worker)
                            except asyncio.CancelledError:
                                continue
                            except Exception:
                                break
                        if not worker.cancelled():
                            worker.exception()
                        raise
            except ToolDenied as exc:
                # Bounded timeout/output failures retain observed output, never success.
                if hasattr(exc, "result"):
                    return {**exc.result, "exit_code": -1}
                raise HTTPException(422, str(exc)) from None
            except (ValueError, TypeError, KeyError, AttributeError, OSError, RecursionError):
                raise HTTPException(422, "Invalid source or unavailable Docker runtime") from None
        finally:
            slot.release()

    return app
