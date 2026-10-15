"""Read chat records from a bounded account archive without extracting files."""

import io
import json
import stat
import threading
import time
import zipfile
import zlib
from typing import Literal

from fastapi import Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .account_export import COLLECTIONS
from .store import uid

MAX_UPLOAD = 4 * 1024 * 1024
MAX_TEXT = 2 * 1024 * 1024


class ArchiveError(ValueError):
    pass


class SourceChat(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=120)


class SourceMessage(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    chat_id: str = Field(min_length=1, max_length=128)
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20000)
    status: Literal["completed", "error", "interrupted", "running"]


def parse_archive(payload):
    if len(payload) > MAX_UPLOAD:
        raise ArchiveError("Archive exceeds 4 MiB")
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            members = archive.infolist()
            allowed = {name + ".ndjson" for name in COLLECTIONS} | {"account.json", "manifest.json"}
            names = [entry.filename for entry in members]
            if len(names) != len(set(names)) or not set(names) <= allowed:
                raise ArchiveError("Duplicate or unsupported archive members")
            if sum(entry.file_size for entry in members) > 16 * 1024 * 1024:
                raise ArchiveError("Expanded archive exceeds 16 MiB")
            if any(
                entry.flag_bits & 1 or stat.S_ISLNK(entry.external_attr >> 16) for entry in members
            ):
                raise ArchiveError("Encrypted archives and links are not supported")

            def read(name, limit):
                if archive.getinfo(name).file_size > limit:
                    raise ArchiveError("Chat collection size limit exceeded")
                with archive.open(name) as member:
                    data = member.read(limit + 1)
                if len(data) > limit:
                    raise ArchiveError("Chat collection size limit exceeded")
                return data.decode("utf-8")

            manifest = json.loads(read("manifest.json", 16384))
            if (
                not isinstance(manifest, dict)
                or manifest.get("format") != "modax-account-export"
                or type(manifest.get("version")) is not int
                or manifest["version"] != 1
            ):
                raise ArchiveError("Unsupported account export format")
            chat_lines = [line for line in read("chats.ndjson", 65536).splitlines() if line.strip()]
            message_lines = [
                line
                for line in read("messages.ndjson", 8 * 1024 * 1024).splitlines()
                if line.strip()
            ]
            if len(chat_lines) > 50 or len(message_lines) > 5000:
                raise ArchiveError("Import limit: 50 chats and 5000 messages")
            chats = [SourceChat.model_validate_json(line) for line in chat_lines]
            messages = [SourceMessage.model_validate_json(line) for line in message_lines]
            counts = manifest.get("counts")
            if not isinstance(counts, dict) or any(
                type(counts.get(key)) is not int or counts[key] != value
                for key, value in (("chats", len(chats)), ("messages", len(messages)))
            ):
                raise ArchiveError("Chat record counts do not match the manifest")
            groups = {chat.id: {"title": chat.title, "messages": []} for chat in chats}
            if len(groups) != len(chats) or len({m.id for m in messages}) != len(messages):
                raise ArchiveError("Duplicate chat or message identifiers")
            if sum(len(m.content.encode("utf-8")) for m in messages) > MAX_TEXT:
                raise ArchiveError("Imported text exceeds 2 MiB")
            for message in messages:
                if message.chat_id not in groups:
                    raise ArchiveError("Message references an absent chat")
                groups[message.chat_id]["messages"].append(message)
            for group in groups.values():
                if (
                    len(group["messages"]) > 100
                    or sum(len(m.content) for m in group["messages"]) > 100000
                ):
                    raise ArchiveError("Per-chat limit: 100 messages and 100000 characters")
            return list(groups.values())
    except ArchiveError:
        raise
    except (
        ValueError,
        KeyError,
        TypeError,
        RuntimeError,
        RecursionError,
        NotImplementedError,
        OSError,
        zipfile.BadZipFile,
        EOFError,
        zlib.error,
    ):
        raise ArchiveError("Invalid account archive; no chats imported") from None


def install_account_import(app):
    store = app.state.store
    gate = threading.BoundedSemaphore(1)

    @app.post("/api/v1/account/import-chats", status_code=201)
    def import_chats(file: UploadFile = File(...), user=Depends(app.state.owner_dependency)):
        if not gate.acquire(blocking=False):
            raise HTTPException(429, "Another chat import is active; retry later")
        try:
            try:
                groups = parse_archive(file.file.read(MAX_UPLOAD + 1))
            except ArchiveError as error:
                raise HTTPException(422, str(error)) from None
            if not groups:
                raise HTTPException(422, "The archive contains no chats")
            created, message_count, interrupted = [], 0, 0
            now = time.time()
            with store.connect() as db:
                store.lock_user(db, user)
                count = db.execute(
                    "SELECT COUNT(*) AS n FROM chats WHERE owner=?", (user,)
                ).fetchone()["n"]
                if count + len(groups) > 1000:
                    raise HTTPException(429, "Stored chat quota reached; no chats imported")
                for ordinal, group in enumerate(groups):
                    chat_id = uid()
                    db.execute(
                        "INSERT INTO chats VALUES(?,?,?,?)",
                        (chat_id, user, group["title"], now + ordinal * 0.001),
                    )
                    created.append({"id": chat_id, "title": group["title"]})
                    for index, message in enumerate(group["messages"]):
                        status = "interrupted" if message.status == "running" else message.status
                        interrupted += message.status == "running"
                        db.execute(
                            "INSERT INTO messages VALUES(?,?,?,?,?,?,?)",
                            (
                                uid(),
                                chat_id,
                                message.role,
                                message.content,
                                "imported",
                                status,
                                now + index * 0.001,
                            ),
                        )
                        message_count += 1
                db.execute(
                    "INSERT INTO audit(owner,action,details,created) VALUES(?,?,?,?)",
                    (
                        user,
                        "chats.archive_import",
                        json.dumps({"chats": len(created), "messages": message_count}),
                        now,
                    ),
                )
            return {
                "chats": created,
                "imported_messages": message_count,
                "interrupted_messages": interrupted,
            }
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "Chat import failed; no chats imported") from None
        finally:
            gate.release()
