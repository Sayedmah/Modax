"""Postgres implementation with the same parameterized Store contract."""

import sqlite3
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from .store import MIGRATIONS, Store


class Connection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, args=()):
        if sql == "BEGIN IMMEDIATE":
            sql = "SELECT 1"
        try:
            return self.connection.execute(sql.replace("?", "%s"), args)
        except psycopg.errors.UniqueViolation as exc:
            raise sqlite3.IntegrityError("Unique constraint") from exc


class PostgresStore(Store):
    def __init__(self, url):
        self.url = url
        self.migrate()

    @contextmanager
    def connect(self):
        with psycopg.connect(self.url, row_factory=dict_row, connect_timeout=10) as connection:
            yield Connection(connection)

    def migrate(self):
        with self.connect() as db:
            db.execute("SELECT pg_advisory_xact_lock(860142)")
            db.execute("CREATE TABLE IF NOT EXISTS modax_migrations(version INTEGER PRIMARY KEY)")
            row = db.execute(
                "SELECT COALESCE(MAX(version),0) AS version FROM modax_migrations"
            ).fetchone()
            for index, migration in enumerate(MIGRATIONS[row["version"] :], row["version"] + 1):
                sql = migration.replace(
                    "id INTEGER PRIMARY KEY", "id BIGSERIAL PRIMARY KEY"
                ).replace(" REAL", " DOUBLE PRECISION")
                for statement in sql.split(";"):
                    if statement.strip():
                        db.execute(statement)
                db.execute("INSERT INTO modax_migrations VALUES(?)", (index,))

    def lock_user(self, db, owner):
        db.execute("SELECT id FROM users WHERE id=? FOR UPDATE", (owner,))

    @contextmanager
    def read_snapshot(self, check=None):
        with self.connect() as db:
            db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            db.execute("SET LOCAL statement_timeout = '15s'")
            yield db

    def snapshot_rows(self, db, sql, args, check):
        def budget():
            remaining = check()
            milliseconds = max(1, min(15000, int(remaining * 1000)))
            db.execute("SELECT set_config('statement_timeout', ?, true)", (str(milliseconds),))

        # Ordinary psycopg cursors buffer full results. Named cursors fetch bounded rows.
        with db.connection.cursor(name="modax_account_export") as cursor:
            budget()
            cursor.execute(sql.replace("?", "%s"), args)
            while True:
                budget()
                rows = cursor.fetchmany(1)
                if not rows:
                    break
                yield rows[0]

    def lock_task(self, db, owner, task_id):
        db.execute("SELECT id FROM tasks WHERE id=? AND owner=? FOR UPDATE", (task_id, owner))
