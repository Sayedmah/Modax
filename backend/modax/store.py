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

MIGRATIONS.append("""
CREATE TABLE provider_profiles(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), family TEXT NOT NULL, model TEXT NOT NULL, base_url TEXT NOT NULL, secret TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX provider_profiles_owner ON provider_profiles(owner);
CREATE TABLE documents(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX documents_owner ON documents(owner);
CREATE TABLE chunks(id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, content TEXT NOT NULL);
CREATE INDEX chunks_document ON chunks(document_id,ordinal);
CREATE TABLE user_settings(owner TEXT PRIMARY KEY REFERENCES users(id), settings TEXT NOT NULL);
CREATE TABLE evaluations(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), results TEXT NOT NULL, created REAL NOT NULL);
""")

MIGRATIONS.append("""
CREATE TABLE workspace_files(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, path TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY(task_id,path));
CREATE TABLE workspace_snapshots(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, files TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX snapshots_task ON workspace_snapshots(task_id,created);
""")

MIGRATIONS.append("""
CREATE TABLE inference_reservations(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), created REAL NOT NULL);
CREATE INDEX reservations_owner ON inference_reservations(owner,created);
""")


MIGRATIONS.append("""
CREATE TABLE arena_datasets(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, cases TEXT NOT NULL, version TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX arena_datasets_owner ON arena_datasets(owner,created);
""")


MIGRATIONS.append("""
CREATE TABLE chat_modes(chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE, mode TEXT NOT NULL CHECK(mode IN ('M','X')));
""")


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
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
        path.chmod(0o600)

    @contextmanager
    def read_snapshot(self, check=None):
        with self.connect() as db:
            db.execute("BEGIN")
            db.execute("PRAGMA query_only=ON")

            def interrupt():
                try:
                    if check:
                        check()
                    return 0
                except Exception:
                    return 1

            db.set_progress_handler(interrupt, 1000)
            try:
                yield db
            finally:
                db.set_progress_handler(None, 0)

    def snapshot_rows(self, db, sql, args, check):
        check()
        cursor = db.execute(sql, args)
        while True:
            check()
            row = cursor.fetchone()
            if row is None:
                break
            yield row

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

    def lock_user(self, db, owner):
        db.execute("BEGIN IMMEDIATE")

    def lock_task(self, db, owner, task_id):
        db.execute("BEGIN IMMEDIATE")

    def reserve_chat(self, owner, limit):
        now = time.time()
        reservation = uid()
        with self.connect() as db:
            self.lock_user(db, owner)
            db.execute("DELETE FROM inference_reservations WHERE created<?", (now - 86400,))
            used = db.execute(
                "SELECT COUNT(*) AS count FROM usage WHERE owner=? AND created>?",
                (owner, now - 86400),
            ).fetchone()["count"]
            pending = db.execute(
                "SELECT COUNT(*) AS count FROM inference_reservations WHERE owner=? AND created>?",
                (owner, now - 86400),
            ).fetchone()["count"]
            if used + pending >= limit:
                raise ValueError("Daily chat request quota exceeded")
            db.execute(
                "INSERT INTO inference_reservations VALUES(?,?,?)", (reservation, owner, now)
            )
        return reservation

    def require(self, table, owner, resource_id):
        if table not in {
            "chats",
            "tasks",
            "memory",
            "assets",
            "provider_profiles",
            "documents",
            "evaluations",
        }:
            raise ValueError("Invalid resource")
        rows = self.query(f"SELECT * FROM {table} WHERE id=? AND owner=?", (resource_id, owner))
        if not rows:
            raise KeyError(resource_id)
        return rows[0]
