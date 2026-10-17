"""Optional external ComfyUI queue adapter. No bundled models or GPL source."""

import re
from pathlib import PurePosixPath

import httpx


class MediaError(RuntimeError):
    pass


class ComfyClient:
    def __init__(self, url, transport=None):
        self.url = url.rstrip("/")
        self.transport = transport

    async def request(self, method, path, payload=None):
        try:
            async with httpx.AsyncClient(
                timeout=30, transport=self.transport, follow_redirects=False
            ) as client:
                response = await client.request(method, self.url + path, json=payload)
                response.raise_for_status()
                if method == "POST" and path == "/queue" and not response.content:
                    return {}
                return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MediaError("ComfyUI service unavailable or invalid response") from exc

    async def submit(self, graph):
        data = await self.request("POST", "/prompt", {"prompt": graph})
        if data.get("node_errors") or not isinstance(data.get("prompt_id"), str):
            raise MediaError("Workflow rejected by ComfyUI")
        return data["prompt_id"]

    def job_id(self, job):
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", job):
            raise MediaError("Invalid job identifier")
        return job

    async def status(self, job):
        data = await self.request("GET", "/history/" + self.job_id(job))
        entry = data.get(job)
        if not entry:
            queue = await self.request("GET", "/queue")
            running = any(row[1] == job for row in queue.get("queue_running", []))
            pending = any(row[1] == job for row in queue.get("queue_pending", []))
            return {
                "state": "RUNNING" if running else "QUEUED" if pending else "UNKNOWN",
                "outputs": [],
            }
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            return {"state": "FAILED", "outputs": []}
        outputs = []
        for node in entry.get("outputs", {}).values():
            for kind in ("images", "gifs", "videos", "audio"):
                for output in node.get(kind, []):
                    self.validate_output(output)
                    outputs.append(output)
        return {"state": "COMPLETED" if status.get("completed") else "RUNNING", "outputs": outputs}

    def validate_output(self, output):
        if output.get("type") != "output":
            raise MediaError("Only output files may be downloaded")
        filename = output.get("filename", "")
        subfolder = output.get("subfolder", "")
        if (
            not filename
            or "/" in filename
            or "\\" in filename
            or ":" in filename
            or filename.startswith(".")
        ):
            raise MediaError("Invalid output filename")
        path = PurePosixPath(subfolder)
        if path.is_absolute() or ".." in path.parts or "\\" in subfolder or ":" in subfolder:
            raise MediaError("Invalid output folder")

    async def download(self, output):
        self.validate_output(output)
        data = bytearray()
        try:
            async with httpx.AsyncClient(
                timeout=60, transport=self.transport, follow_redirects=False
            ) as client:
                async with client.stream(
                    "GET",
                    self.url + "/view",
                    params={k: output.get(k, "") for k in ("filename", "subfolder", "type")},
                ) as response:
                    response.raise_for_status()
                    mime = response.headers.get("content-type", "application/octet-stream").split(
                        ";"
                    )[0]
                    if not mime.startswith(("image/", "video/", "audio/")):
                        raise MediaError("Invalid media content type")
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > 64 * 1024 * 1024:
                            raise MediaError("Media output exceeds 64 MB")
        except httpx.HTTPError as exc:
            raise MediaError("Media download failed") from exc
        return bytes(data), mime

    async def cancel(self, job):
        self.job_id(job)
        queue = await self.request("GET", "/queue")
        if any(row[1] == job for row in queue.get("queue_running", [])):
            # /interrupt is service-global and could stop another user's job.
            raise MediaError("Job is running; global interrupt is intentionally unavailable")
        if not any(row[1] == job for row in queue.get("queue_pending", [])):
            raise MediaError("Job is not pending; refresh status")
        await self.request("POST", "/queue", {"delete": [job]})
