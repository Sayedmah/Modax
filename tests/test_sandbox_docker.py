"""Opt-in real Docker checks. No submitted source is ever imported on the host."""

import os
import subprocess
import sys
import time

import httpx
import pytest
from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings
from modax.sandbox_worker import create_worker
from modax.workspace import Workspace
from test_chat import register

IMAGE = os.getenv("MODAX_TEST_SANDBOX_IMAGE", "")
pytestmark = pytest.mark.skipif(not IMAGE, reason="Dedicated Docker runtime not configured")


def test_actual_container_isolation_and_http_worker(tmp_path):
    source = """import unittest,os,socket
from pathlib import Path
class Isolation(unittest.TestCase):
 def test_isolation(self):
  self.assertEqual(os.getuid(),65534)
  self.assertNotIn('MODAX_HOST_CANARY',os.environ)
  self.assertFalse(Path('/var/run/docker.sock').exists())
  with self.assertRaises(OSError): Path('/project/write.txt').write_text('no')
  with self.assertRaises(OSError): Path('/root/write.txt').write_text('no')
  self.assertEqual(set(os.listdir('/sys/class/net')),{'lo'})
  with self.assertRaises(OSError): socket.create_connection(('192.0.2.1',80),timeout=1)
  Path('/tmp/scratch.txt').write_text('ephemeral')
"""
    os.environ["MODAX_HOST_CANARY"] = "must-not-enter-container"
    token = "disposable-ci-worker-token-1234567890"
    with TestClient(create_worker(token, IMAGE)) as worker:
        response = worker.post(
            "/v1/test",
            headers={"X-Modax-Sandbox-Token": token},
            json={"files": [{"path": "test_isolation.py", "content": source}]},
        )
        assert response.status_code == 200, response.text
        assert response.json()["exit_code"] == 0, response.json()
        assert "MODAX_DISCOVERED_TESTS 1" in response.json()["output"]
    workspace = Workspace(tmp_path / "project")
    workspace.apply([{"path": "empty.py", "content": "x=1\n"}])
    assert workspace.run_tests(True, IMAGE)["exit_code"] == 5
    workspace.apply(
        [
            {
                "path": "test_failure.py",
                "content": "import unittest\nclass Test(unittest.TestCase):\n def test_failure(self): self.fail('observed failure')\n",
            }
        ]
    )
    failed = workspace.run_tests(True, IMAGE)
    assert failed["exit_code"] == 1 and "observed failure" in failed["output"]
    workspace.apply([{"path": "test_failure.py", "content": "import os\nos._exit(0)\n"}])
    assert workspace.run_tests(True, IMAGE)["exit_code"] == 6


def test_actual_api_to_http_worker_container_and_download(tmp_path):
    token = "disposable-e2e-worker-token-1234567890"
    address = "http://127.0.0.1:8769"
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "modax.sandbox_worker:create_worker",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            "8769",
        ],
        env={**os.environ, "MODAX_SANDBOX_TOKEN": token, "MODAX_TEST_IMAGE": IMAGE},
    )
    try:
        with httpx.Client(trust_env=False, timeout=1) as http:
            deadline = time.monotonic() + 15
            while True:
                try:
                    assert http.get(address + "/health").status_code == 200
                    break
                except httpx.HTTPError:
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise AssertionError("Dedicated test worker did not start") from None
                    time.sleep(0.1)
        settings = Settings(
            data_dir=tmp_path, allow_signup=True, sandbox_url=address, sandbox_token=token
        )
        with TestClient(create_app(settings)) as client:
            headers = register(client)
            foreign = register(client, "other-sandbox-owner")
            task = client.post(
                "/api/v1/tasks",
                headers=headers,
                json={"kind": "sandbox", "goal": "Real isolated test"},
            ).json()
            route = "/api/v1/tasks/" + task["id"]
            source = "import unittest\nclass Test(unittest.TestCase):\n def test_sum(self): self.assertEqual(3+4,7)\n"
            assert (
                client.post(
                    route + "/project", headers=headers, files={"file": ("test_sum.py", source)}
                ).status_code
                == 201
            )
            result = client.post(route + "/run", headers=headers, json={"execute": True}).json()
            assert result["state"] == "COMPLETED", result
            report = client.get(route + "/report", headers=headers).json()
            assert report["result"]["runtime_tests"]["exit_code"] == 0
            assert "MODAX_RUN_COMPLETED 1" in report["result"]["runtime_tests"]["output"]
            assert report["result"]["model_called"] is False
            assert client.get(route + "/attachment/test_sum.py", headers=headers).text == source
            assert client.get(route + "/report", headers=foreign).status_code == 404
    finally:
        process.terminate()
        process.wait(timeout=10)
