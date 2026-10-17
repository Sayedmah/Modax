"""Bounded file tools, rollback, and opt-in isolated runtime validation."""

import ast
import io
import json
import os
import re
import selectors
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

from .store import uid


class ToolDenied(ValueError):
    pass


SUFFIXES = {".py", ".md", ".txt", ".json", ".gd", ".tscn", ".godot", ".cfg", ".tres"}
SECRET = re.compile(
    r"(?i)(api[_-]?key\s*[:=]|-----BEGIN .*PRIVATE KEY|sk-[A-Za-z0-9_-]{20,}|bearer\s+[A-Za-z0-9_-]{24,})"
)


def bounded_command(args, cwd, timeout=60, limit=262144, cancel_event=None):
    """Fixed caller-owned argv, no shell; terminate on timeout or excessive output."""
    proc = subprocess.Popen(
        args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True
    )
    output = bytearray()
    started = time.monotonic()
    deadline = started + timeout
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    try:
        while selector.get_map():
            if cancel_event is not None and cancel_event.is_set():
                raise ToolDenied("Command cancelled")
            if time.monotonic() >= deadline:
                raise ToolDenied("Command timed out")
            for key, _ in selector.select(0.1):
                chunk = os.read(key.fileobj.fileno(), 8192)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                output.extend(chunk)
                if len(output) > limit:
                    raise ToolDenied("Command output limit exceeded")
        return {
            "exit_code": proc.wait(timeout=max(0.1, deadline - time.monotonic())),
            "output": output.decode(errors="replace"),
            "duration_seconds": round(time.monotonic() - started, 3),
        }
    except (ToolDenied, subprocess.TimeoutExpired) as exc:
        error = exc if isinstance(exc, ToolDenied) else ToolDenied("Command timed out")
        error.result = {
            "exit_code": proc.poll() if proc.poll() is not None else -9,
            "output": output[:limit].decode(errors="replace"),
            "duration_seconds": round(time.monotonic() - started, 3),
            "timed_out": isinstance(exc, subprocess.TimeoutExpired) or "timed out" in str(exc),
        }
        raise error
    finally:
        selector.close()
        if proc.poll() is None:
            if os.name == "posix":
                import signal

                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
            proc.wait()
        proc.stdout.close()


class Workspace:
    max_bytes = 4 * 1024 * 1024

    def __init__(self, root):
        root = Path(root).absolute()
        if root.is_symlink():
            raise ToolDenied("Symlink workspace rejected")
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root = root.resolve()
        self.snapshots = self.root.parent / (self.root.name + "-snapshots")

    def path(self, name):
        if (
            not isinstance(name, str)
            or len(name) > 200
            or "\\" in name
            or ":" in name
            or any(ord(c) < 32 or ord(c) == 127 for c in name)
        ):
            raise ToolDenied("Invalid path")
        rel = Path(name)
        if (
            rel.is_absolute()
            or not rel.parts
            or any(p in {"..", "."} or p.startswith(".") for p in rel.parts)
        ):
            raise ToolDenied("Path outside authorized workspace")
        if rel.suffix.lower() not in SUFFIXES:
            raise ToolDenied("Unsupported file type")
        current = self.root
        for part in rel.parts:
            current = current / part
            if current.is_symlink() or (current.is_file() and current.stat().st_nlink != 1):
                raise ToolDenied("Linked files rejected")
        if not current.resolve().is_relative_to(self.root):
            raise ToolDenied("Path outside authorized workspace")
        return current

    def files(self, enforce_quota=True):
        result = []
        total = 0
        for p in self.root.rglob("*"):
            if p.is_symlink():
                raise ToolDenied("Symlink in workspace")
            if p.is_file():
                name = p.relative_to(self.root).as_posix()
                self.path(name)
                total += p.stat().st_size
                if enforce_quota and (total > self.max_bytes or len(result) >= 256):
                    raise ToolDenied("Workspace quota exceeded")
                result.append(name)
        return sorted(result)

    def read(self, name):
        p = self.path(name)
        if not p.is_file() or p.stat().st_size > 131072:
            raise ToolDenied("Missing or oversized file")
        return p.read_bytes().decode("utf-8")

    def apply(self, files):
        if not isinstance(files, list) or not 1 <= len(files) <= 32:
            raise ToolDenied("Edit count must be 1..32")
        validated = {}
        for edit in files:
            if not isinstance(edit, dict) or set(edit) != {"path", "content"}:
                raise ToolDenied("Invalid edit schema")
            p, text = self.path(edit["path"]), edit["content"]
            if not isinstance(text, str) or len(text.encode()) > 131072 or SECRET.search(text):
                raise ToolDenied("Oversized file or possible secret")
            if p in validated:
                raise ToolDenied("Duplicate edit path")
            try:
                if p.suffix == ".py":
                    ast.parse(text, filename=edit["path"])
                elif p.suffix == ".json":
                    json.loads(text)
            except (SyntaxError, ValueError, RecursionError) as exc:
                raise ToolDenied("Generated file failed syntax validation") from exc
            validated[p] = text
        existing = self.files()
        names = {self.root / name for name in existing} | set(validated)
        if len(names) > 256:
            raise ToolDenied("Workspace file-count quota exceeded")
        total = sum(
            (self.root / name).stat().st_size
            for name in existing
            if self.root / name not in validated
        )
        total += sum(len(v.encode()) for v in validated.values())
        if total > self.max_bytes:
            raise ToolDenied("Workspace quota exceeded")
        snapshot = uid()
        self.snapshots.mkdir(exist_ok=True, mode=0o700)
        snapshots = sorted(self.snapshots.iterdir(), key=lambda p: p.stat().st_mtime)
        for old in snapshots[:-9]:
            shutil.rmtree(old)
        shutil.copytree(self.root, self.snapshots / snapshot)
        try:
            for p, text in validated.items():
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(text.encode("utf-8"))
        except Exception:
            self.rollback(snapshot)
            raise
        return snapshot

    def rollback(self, snapshot):
        if not re.fullmatch(r"[0-9a-f]{32}", snapshot):
            raise ToolDenied("Invalid snapshot")
        source = self.snapshots / snapshot
        if not source.is_dir() or source.is_symlink():
            raise ToolDenied("Snapshot missing")
        self.files(enforce_quota=False)
        shutil.rmtree(self.root)
        shutil.copytree(source, self.root)

    def archive(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as archive:
            for name in self.files():
                archive.write(self.path(name), name)
        return data.getvalue()

    def run_tests(self, enabled=False, image="", cancel_event=None):
        if not enabled:
            raise ToolDenied("Runtime tests disabled; configure dedicated Docker worker")
        if not re.fullmatch(r"[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}", image):
            raise ToolDenied("Configure MODAX_TEST_IMAGE with an immutable image digest")
        if not shutil.which("docker"):
            raise ToolDenied("Docker executable unavailable")
        self.files()
        # Operator pre-pulls a pinned image; this tool cannot download code or use the host network.
        container = "modax-" + uid()
        args = [
            "docker",
            "run",
            "--name",
            container,
            "--rm",
            "--pull=never",
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--pids-limit=64",
            "--memory=256m",
            "--cpus=1",
            "--user=65534:65534",
            "--tmpfs=/tmp:rw,noexec,nosuid,size=16m",
            "--mount",
            f"type=bind,src={self.root},dst=/project,readonly",
            "--workdir=/project",
            image,
            "python",
            "-B",
            "-m",
            "unittest",
            "discover",
            "-v",
        ]
        try:
            with tempfile.TemporaryDirectory(prefix="modax-runtime-") as directory:
                stage = Path(directory) / "project"
                shutil.copytree(self.root, stage)
                stage.chmod(0o755)
                for path in stage.rglob("*"):
                    path.chmod(0o755 if path.is_dir() else 0o644)
                mount_index = args.index("--mount") + 1
                args[mount_index] = f"type=bind,src={stage},dst=/project,readonly"
                options = {"cancel_event": cancel_event} if cancel_event is not None else {}
                return bounded_command(args, stage, timeout=60, **options)
        finally:
            subprocess.run(
                ["docker", "rm", "-f", container], capture_output=True, timeout=10, check=False
            )


class DatabaseWorkspace(Workspace):
    """Durable artifacts backed by the already owner-authorized task."""

    def __init__(self, root, store, task_id):
        missing = not Path(root).exists()
        super().__init__(root)
        self.store, self.task_id = store, task_id
        if missing:
            rows = store.query(
                "SELECT path,content FROM workspace_files WHERE task_id=?", (task_id,)
            )
            for row in rows:
                path = self.path(row["path"])
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(row["content"].encode("utf-8"))
            self.files()
        if not self.snapshots.exists():
            self.snapshots.mkdir(mode=0o700)
            for row in store.query(
                "SELECT id,files FROM workspace_snapshots WHERE task_id=?", (task_id,)
            ):
                if not re.fullmatch(r"[0-9a-f]{32}", row["id"]):
                    raise ToolDenied("Invalid persisted snapshot")
                folder = self.snapshots / row["id"]
                folder.mkdir()
                for name, text in json.loads(row["files"]).items():
                    self.path(name)
                    path = folder / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(text.encode("utf-8"))

    def persist(self):
        files = {name: self.read(name) for name in self.files()}
        with self.store.connect() as db:
            db.execute("DELETE FROM workspace_files WHERE task_id=?", (self.task_id,))
            for name, text in files.items():
                db.execute("INSERT INTO workspace_files VALUES(?,?,?)", (self.task_id, name, text))

    def apply(self, files):
        snapshot = super().apply(files)
        before = {
            p.relative_to(self.snapshots / snapshot).as_posix(): p.read_bytes().decode("utf-8")
            for p in (self.snapshots / snapshot).rglob("*")
            if p.is_file()
        }
        self.store.execute(
            "INSERT INTO workspace_snapshots VALUES(?,?,?,?)",
            (snapshot, self.task_id, json.dumps(before), time.time()),
        )
        old = self.store.query(
            "SELECT id FROM workspace_snapshots WHERE task_id=? ORDER BY created DESC",
            (self.task_id,),
        )[10:]
        for row in old:
            self.store.execute("DELETE FROM workspace_snapshots WHERE id=?", (row["id"],))
        self.persist()
        return snapshot

    def rollback(self, snapshot):
        super().rollback(snapshot)
        self.persist()
