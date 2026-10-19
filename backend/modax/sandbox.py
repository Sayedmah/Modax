"""Server-only transport to a dedicated Docker test worker; no host execution fallback."""

import json

import httpx

from .workspace import ToolDenied


def sandbox_configured(settings):
    return bool(settings.sandbox_url and len(settings.sandbox_token) >= 32)


def run_sandbox(workspace, settings, cancel_event=None):
    if not sandbox_configured(settings):
        raise ToolDenied("Sandbox unavailable: connect a dedicated Docker worker")
    files = [{"path": name, "content": workspace.read(name)} for name in workspace.files()]
    if not files or len(files) > 32 or sum(len(x["content"].encode()) for x in files) > 120000:
        raise ToolDenied("Sandbox accepts 1..32 files and at most 120 KB of UTF-8 source")
    if cancel_event is not None and cancel_event.is_set():
        raise ToolDenied("Sandbox cancelled")
    try:
        with httpx.Client(timeout=75, follow_redirects=False, trust_env=False) as client:
            with client.stream(
                "POST",
                settings.sandbox_url.rstrip("/") + "/v1/test",
                headers={"X-Modax-Sandbox-Token": settings.sandbox_token},
                json={"files": files},
            ) as response:
                response.raise_for_status()
                raw = bytearray()
                for block in response.iter_bytes():
                    raw.extend(block)
                    if len(raw) > 280000:
                        raise ValueError("Oversized worker response")
        result = json.loads(raw)
        if (
            not isinstance(result, dict)
            or type(result.get("exit_code")) is not int
            or not isinstance(result.get("output"), str)
            or len(result["output"].encode()) > 262144
            or type(result.get("duration_seconds")) not in {int, float}
            or not 0 <= result["duration_seconds"] <= 75
        ):
            raise ValueError("Invalid worker result")
        if cancel_event is not None and cancel_event.is_set():
            raise ToolDenied("Sandbox cancelled; worker finishes within its bounded deadline")
        return {key: result[key] for key in ("exit_code", "output", "duration_seconds")}
    except (httpx.HTTPError, ValueError, TypeError, KeyError, RecursionError):
        raise ToolDenied("Sandbox worker unavailable or returned an invalid result") from None
