import threading

import pytest
from modax import managed_godot


def test_cancelled_engine_download_cleans_partial_archive(tmp_path, monkeypatch):
    monkeypatch.setenv("MODAX_DATA_DIR", str(tmp_path))
    stop = threading.Event()

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self, size):
            stop.set()
            return b"partial-archive"

    def open_url(url, timeout):
        assert url == managed_godot.URL
        assert timeout <= 10
        return Response()

    monkeypatch.setattr(managed_godot.urllib.request, "urlopen", open_url)
    with pytest.raises(OSError, match="cancelled"):
        managed_godot.installed_godot(cancel_event=stop)
    assert not (tmp_path / "trusted-engine" / "engine.zip").exists()
    assert not (tmp_path / "trusted-engine" / managed_godot.NAME).exists()
