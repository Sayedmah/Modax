"""Acquire one fixed official engine build; never download user-selected executables."""

import hashlib
import os
import threading
import urllib.request
import zipfile
from pathlib import Path

_LOCK = threading.Lock()
URL = "https://github.com/godotengine/godot/releases/download/4.6-stable/Godot_v4.6-stable_linux.x86_64.zip"
SHA256 = "6bcc59dfd1d670e918c77eae06e82b9dc5699de13d353dc3a4b3b6b307b6dc06"
NAME = "Godot_v4.6-stable_linux.x86_64"


def installed_godot():
    with _LOCK:
        root = Path(os.getenv("MODAX_DATA_DIR", "var")) / "trusted-engine"
        engine = root / NAME
        if engine.is_file():
            return str(engine.absolute())
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        archive = root / "engine.zip"
        digest = hashlib.sha256()
        size = 0
        try:
            with urllib.request.urlopen(URL, timeout=60) as response, archive.open("wb") as output:
                while chunk := response.read(1048576):
                    size += len(chunk)
                    if size > 100 * 1024 * 1024:
                        raise ValueError("Engine archive exceeds size limit")
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != SHA256:
                raise ValueError("Engine checksum mismatch")
            with zipfile.ZipFile(archive) as source:
                with source.open(NAME) as stream, (root / "engine.part").open("wb") as output:
                    while chunk := stream.read(1048576):
                        output.write(chunk)
            (root / "engine.part").replace(engine)
            engine.chmod(0o700)
        finally:
            archive.unlink(missing_ok=True)
            (root / "engine.part").unlink(missing_ok=True)
        return str(engine.absolute())
