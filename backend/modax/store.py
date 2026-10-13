"""Transactional SQLite persistence. Every resource operation includes an owner."""

import hashlib
import json
import secrets
import sqlite3
import time
from contextlib import contextmanager

MIGRATIONS = [
    """
CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, owner TEXT REFERENCES users(id) ON DELETE CASCADE, expires REAL NOT NULL);
CREATE TABLE chats(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX chats_owner ON chats(owner,created);
CREATE TABLE messages(id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, model TEXT, status TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX messages_chat ON messages(chat_id,created);
CREATE TABLE tasks(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), goal TEXT NOT NULL, kind TEXT NOT NULL, mode TEXT NOT NULL, state TEXT NOT NULL, plan TEXT NOT NULL, result TEXT, created REAL NOT NULL);
CREATE INDEX tasks_owner ON tasks(owner,created);
CREATE TABLE task_steps(id INTEGER PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, phase TEXT NOT NULL, status TEXT NOT NULL, details TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE memory(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX memory_owner ON memory(owner);
CREATE TABLE usage(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cost REAL, latency_ms REAL NOT NULL, created REAL NOT NULL);
CREATE TABLE assets(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, path TEXT NOT NULL, metadata TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE audit(id INTEGER PRIMARY KEY, owner TEXT REFERENCES users(id), action TEXT NOT NULL, details TEXT NOT NULL, created REAL NOT NULL);
"""
]


def uid():
    return secrets.token_hex(16)


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return salt.hex() + ":" + digest.hex()


def verify_password(password, encoded):
    salt, digest = encoded.split(":")
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
    return secrets.compare_digest(actual.hex(), digest)


class Store:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.migrate()
        path.chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def migrate(self):
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            for i, sql in enumerate(MIGRATIONS[version:], version + 1):
                db.executescript("BEGIN IMMEDIATE;" + sql + f"PRAGMA user_version={i}; COMMIT;")

    def query(self, sql, args=()):
        with self.connect() as db:
            return [dict(row) for row in db.execute(sql, args)]

    def execute(self, sql, args=()):
        with self.connect() as db:
            return db.execute(sql, args).rowcount

    def audit(self, owner, action, details):
        self.execute(
            "INSERT INTO audit(owner,action,details,created) VALUES(?,?,?,?)",
            (owner, action, json.dumps(details), time.time()),
        )

    def recover(self):
        self.execute("UPDATE messages SET status='interrupted' WHERE status='running'")
        self.execute(
            "UPDATE tasks SET state='BLOCKED', result=? WHERE state IN ('RUNNING','VERIFYING','PLANNING')",
            (json.dumps({"reason": "Worker restarted; inspect artifacts before resuming"}),),
        )

    def require(self, table, owner, resource_id):
        if table not in {"chats", "tasks", "memory", "assets"}:
            raise ValueError("Invalid resource")
        rows = self.query(f"SELECT * FROM {table} WHERE id=? AND owner=?", (resource_id, owner))
        if not rows:
            raise KeyError(resource_id)
        return rows[0]
