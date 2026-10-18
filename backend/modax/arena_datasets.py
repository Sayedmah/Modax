"""Immutable owner-scoped text fixtures; never execute dataset content."""

import hashlib
import json
import time
from typing import Literal

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .store import uid
from .workspace import SECRET


def canonical_json(text):
    def reject_constant(_):
        raise ValueError("Nonfinite JSON constants are not supported")

    return json.dumps(
        json.loads(text, parse_constant=reject_constant),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


class ArenaCase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    task: str = Field(min_length=1, max_length=2000)
    expected: str = Field(min_length=1, max_length=1000)
    match: Literal["exact", "json"] = "exact"


class DatasetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    cases: list[ArenaCase] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def bounded_cases(self):
        if not self.name.strip() or any(
            not c.task.strip() or not c.expected.strip() for c in self.cases
        ):
            raise ValueError("Blank dataset fields")
        if len({c.id for c in self.cases}) != len(self.cases):
            raise ValueError("Duplicate case identifiers")
        if len(self.model_dump_json().encode("utf-8")) > 32768:
            raise ValueError("Dataset exceeds 32 KiB")
        for case in self.cases:
            if case.match == "json":
                try:
                    canonical_json(case.expected)
                except (ValueError, RecursionError):
                    raise ValueError("Invalid expected JSON") from None
        return self


def dataset_for(store, owner, dataset_id):
    rows = store.query(
        "SELECT id,name,cases,version,created FROM arena_datasets WHERE id=? AND owner=?",
        (dataset_id, owner),
    )
    if not rows:
        raise HTTPException(404, "Dataset not found")
    row = rows[0]
    row["cases"] = json.loads(row["cases"])
    row["schema_version"] = 1
    return row


def install_datasets(app):
    store, owner = app.state.store, app.state.owner_dependency

    @app.get("/api/v1/arena/datasets")
    def datasets(user=Depends(owner)):
        rows = store.query(
            "SELECT id,name,version,cases,created FROM arena_datasets WHERE owner=? ORDER BY created DESC,id",
            (user,),
        )
        for row in rows:
            row["case_count"] = len(json.loads(row.pop("cases")))
        return rows

    @app.post("/api/v1/arena/datasets", status_code=201)
    def create_dataset(body: DatasetInput, user=Depends(owner)):
        encoded = json.dumps(
            body.model_dump(), ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        if SECRET.search(encoded):
            raise HTTPException(422, "Possible secrets cannot be stored in datasets")
        dataset_id, created = uid(), time.time()
        version = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
        with store.connect() as db:
            store.lock_user(db, user)
            if (
                db.execute(
                    "SELECT COUNT(*) AS n FROM arena_datasets WHERE owner=?", (user,)
                ).fetchone()["n"]
                >= 20
            ):
                raise HTTPException(429, "Dataset quota reached")
            db.execute(
                "INSERT INTO arena_datasets VALUES(?,?,?,?,?,?)",
                (
                    dataset_id,
                    user,
                    body.name,
                    json.dumps([c.model_dump() for c in body.cases]),
                    version,
                    created,
                ),
            )
        return dataset_for(store, user, dataset_id)

    @app.get("/api/v1/arena/datasets/{dataset_id}")
    def dataset(dataset_id: str, user=Depends(owner)):
        return dataset_for(store, user, dataset_id)

    @app.delete("/api/v1/arena/datasets/{dataset_id}", status_code=204)
    def delete_dataset(dataset_id: str, user=Depends(owner)):
        with store.connect() as db:
            store.lock_user(db, user)
            if not db.execute(
                "SELECT id FROM arena_datasets WHERE id=? AND owner=?", (dataset_id, user)
            ).fetchone():
                raise HTTPException(404, "Dataset not found")
            db.execute("DELETE FROM arena_datasets WHERE id=? AND owner=?", (dataset_id, user))
