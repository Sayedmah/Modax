"""Start an isolated demo API for real browser QA; never use paid providers."""

import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]


def run_check(script):
    with tempfile.TemporaryDirectory(prefix="modax-ui-qa-") as temporary:
        environment = dict(
            os.environ,
            PYTHONPATH=str(root / "backend"),
            MODAX_DATA_DIR=temporary,
            MODAX_ALLOW_SIGNUP="true",
            MODAX_DEMO="true",
            MODAX_GUEST_MODE="true" if os.getenv("MODAX_QA_GUEST") == "true" else "false",
            MODAX_PROVIDER_URL="",
            MODAX_PROVIDER_KEY="",
            GEMINI_API_KEY="",
            OPENROUTER_API_KEY="",
            MODAX_OLLAMA_URL="",
            MODAX_QA_DIR=temporary,
        )
        with open(Path(temporary) / "server.log", "w") as log:
            server = subprocess.Popen(
                [
                    "python",
                    "-m",
                    "uvicorn",
                    "modax.api:create_app",
                    "--factory",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8776",
                ],
                cwd=root,
                env=environment,
                stdout=log,
                stderr=log,
            )
            try:
                deadline = time.monotonic() + 10
                while True:
                    try:
                        urllib.request.urlopen(
                            "http://127.0.0.1:8776/api/v1/health", timeout=1
                        ).close()
                        break
                    except OSError:
                        if server.poll() is not None or time.monotonic() > deadline:
                            raise RuntimeError("QA API did not start") from None
                        time.sleep(0.1)
                subprocess.run(["node", script], cwd=root, env=environment, timeout=90, check=True)
            finally:
                server.terminate()
                server.wait(timeout=10)


for script in [
    "scripts/guest_smoke.cjs" if os.getenv("MODAX_QA_GUEST") == "true" else "scripts/ui_smoke.cjs",
    "scripts/notes_smoke.cjs",
    "scripts/files_smoke.cjs",
    "scripts/arena_smoke.cjs",
]:
    run_check(script)
