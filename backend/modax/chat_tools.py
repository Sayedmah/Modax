import time
from typing import Literal

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from .store import uid


class ImportedMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)


class ChatImport(BaseModel):
    title: str = Field(default="Imported chat", min_length=1, max_length=120)
    messages: list[ImportedMessage] = Field(max_length=100)


class EditMessage(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


def install_chat_tools(app, active):
    store = app.state.store
    owner = app.state.owner_dependency
    require = app.state.require_resource

    @app.post("/api/v1/chats/import", status_code=201)
    def import_chat(body: ChatImport, user=Depends(owner)):
        if sum(len(m.content) for m in body.messages) > 100000:
            raise HTTPException(422, "Import context too large")
        cid = uid()
        now = time.time()
        with store.connect() as db:
            db.execute("INSERT INTO chats VALUES(?,?,?,?)", (cid, user, body.title, now))
            for i, message in enumerate(body.messages):
                db.execute(
                    "INSERT INTO messages VALUES(?,?,?,?,?,?,?)",
                    (
                        uid(),
                        cid,
                        message.role,
                        message.content,
                        "imported",
                        "completed",
                        now + i * 0.001,
                    ),
                )
        return require("chats", user, cid)

    @app.patch("/api/v1/chats/{chat_id}/messages/{message_id}")
    def edit(chat_id: str, message_id: str, body: EditMessage, user=Depends(owner)):
        require("chats", user, chat_id)
        if chat_id in active:
            raise HTTPException(409, "Stop current response before editing")
        rows = store.query(
            "SELECT * FROM messages WHERE id=? AND chat_id=? AND role=?",
            (message_id, chat_id, "user"),
        )
        if not rows:
            raise HTTPException(404, "User message not found")
        with store.connect() as db:
            db.execute("UPDATE messages SET content=? WHERE id=?", (body.content, message_id))
            db.execute(
                "DELETE FROM messages WHERE chat_id=? AND created>?", (chat_id, rows[0]["created"])
            )
        return {"id": message_id, "content": body.content, "later_messages_removed": True}

    @app.delete("/api/v1/chats/{chat_id}", status_code=204)
    def delete(chat_id: str, user=Depends(owner)):
        require("chats", user, chat_id)
        if chat_id in active:
            raise HTTPException(409, "Stop current response before deleting")
        store.execute("DELETE FROM chats WHERE id=? AND owner=?", (chat_id, user))
