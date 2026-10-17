import asyncio
import json

import httpx
import pytest
from modax.media import ComfyClient, MediaError


def test_comfy_submit_status_download_contract():
    def server(request):
        if request.url.path == "/prompt":
            payload = json.loads(request.content)
            assert payload["prompt"]["6"]["inputs"]["text"] == "island"
            return httpx.Response(200, json={"prompt_id": "remote-job-1"})
        if request.url.path == "/history/remote-job-1":
            return httpx.Response(
                200,
                json={
                    "remote-job-1": {
                        "status": {"status_str": "success", "completed": True},
                        "outputs": {
                            "9": {
                                "images": [
                                    {"filename": "result.png", "subfolder": "", "type": "output"}
                                ]
                            }
                        },
                    }
                },
            )
        if request.url.path == "/view":
            return httpx.Response(
                200, content=b"\x89PNG\r\n\x1a\nbytes", headers={"Content-Type": "image/png"}
            )
        return httpx.Response(404)

    client = ComfyClient("http://127.0.0.1:8188", httpx.MockTransport(server))

    async def exercise():
        job = await client.submit(
            {"6": {"inputs": {"text": "island"}, "class_type": "CLIPTextEncode"}}
        )
        assert job == "remote-job-1"
        status = await client.status(job)
        assert status["state"] == "COMPLETED"
        assert status["outputs"][0]["filename"] == "result.png"
        data, mime = await client.download(status["outputs"][0])
        assert data.startswith(b"\x89PNG") and mime == "image/png"

    asyncio.run(exercise())


def test_active_job_cancellation_does_not_interrupt_other_users():
    def server(r):
        return httpx.Response(200, json={"queue_running": [[0, "job-1"]], "queue_pending": []})

    client = ComfyClient("http://127.0.0.1:8188", httpx.MockTransport(server))
    with pytest.raises(MediaError, match="running"):
        asyncio.run(client.cancel("job-1"))


@pytest.mark.parametrize(
    "output",
    [
        {"filename": "../secret", "type": "output"},
        {"filename": "x.png", "subfolder": "../private", "type": "output"},
        {"filename": "x.png", "type": "input"},
    ],
)
def test_remote_file_escape_rejected(output):
    with pytest.raises(MediaError):
        asyncio.run(ComfyClient("http://127.0.0.1:8188").download(output))


def test_pending_cancel_accepts_empty_success_response():
    def server(request):
        if request.method == "GET":
            return httpx.Response(200, json={"queue_pending": [[0, "job-1"]], "queue_running": []})
        assert json.loads(request.content) == {"delete": ["job-1"]}
        return httpx.Response(200)

    asyncio.run(ComfyClient("http://127.0.0.1:8188", httpx.MockTransport(server)).cancel("job-1"))
