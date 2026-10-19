"""Opt-in real Docker checks. No submitted source is ever imported on the host."""

import os

import pytest
from fastapi.testclient import TestClient
from modax.sandbox_worker import create_worker
from modax.workspace import Workspace

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
