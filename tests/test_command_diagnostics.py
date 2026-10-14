import sys
import threading

import pytest
from modax.workspace import ToolDenied, bounded_command


def test_timeout_preserves_observed_output_and_duration(tmp_path):
    with pytest.raises(ToolDenied) as caught:
        bounded_command(
            [sys.executable, "-u", "-c", "import time; print('IMPORT_STARTED'); time.sleep(5)"],
            tmp_path,
            timeout=0.3,
        )
    result = caught.value.result
    assert result["output"] == "IMPORT_STARTED\n"
    assert result["timed_out"] is True
    assert result["exit_code"] != 0
    assert 0.3 <= result["duration_seconds"] < 3


def test_game_timeout_records_failed_stage(monkeypatch):
    from modax import forge

    def command(args, root, timeout):
        if "--version" in args:
            return {"output": "4.6.test", "exit_code": 0}
        error = ToolDenied("Command timed out")
        error.result = {"output": "IMPORT_STARTED", "exit_code": -9, "timed_out": True}
        raise error

    monkeypatch.setattr(forge.shutil, "which", lambda _: sys.executable)
    monkeypatch.setattr(forge, "bounded_command", command)
    result = forge.validate_game(forge.generate_game("Island"))
    assert result["engine"] == "4.6.test"
    assert result["status"] == "failed"
    assert result["checks"][-1]["stage"] == "import"
    assert result["checks"][-1]["output"] == "IMPORT_STARTED"


def test_cancellation_terminates_running_command(tmp_path):
    stop = threading.Event()
    timer = threading.Timer(0.3, stop.set)
    timer.start()
    try:
        with pytest.raises(ToolDenied, match="cancelled") as caught:
            bounded_command(
                [sys.executable, "-u", "-c", "import time; print('RUNNING'); time.sleep(5)"],
                tmp_path,
                timeout=5,
                cancel_event=stop,
            )
        assert "RUNNING" in caught.value.result["output"]
        assert caught.value.result["duration_seconds"] < 3
        assert caught.value.result["timed_out"] is False
    finally:
        timer.cancel()
