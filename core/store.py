"""SQLite persistence. Every run, step, intent, changeset and verdict is durable.

Two reasons this is not in-memory: the UI polls it, and `scripts/record.py`
replays real recorded runs from it when live inference is rate-limited on demo
day. The recorded traces are real runs, not fixtures.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid

from core.config import CONFIG

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id           TEXT PRIMARY KEY,
    task         TEXT NOT NULL,
    scenario     TEXT,
    status       TEXT NOT NULL,          -- running | awaiting_decision | done | failed | stopped
    root_image   TEXT,
    head_image   TEXT,
    created_at   REAL NOT NULL,
    updated_at   REAL NOT NULL,
    budget_json  TEXT,
    report       TEXT,
    error        TEXT,
    replay_of    TEXT
);
CREATE TABLE IF NOT EXISTS steps (
    id             TEXT PRIMARY KEY,
    run_id         TEXT NOT NULL,
    idx            INTEGER NOT NULL,
    kind           TEXT NOT NULL,        -- thought | safe_exec | gated | blocked
    cmd            TEXT,
    risk           TEXT,
    intent_json    TEXT,
    premise_json   TEXT,
    changeset_json TEXT,
    verdict_json   TEXT,
    exec_output    TEXT,
    parent_image   TEXT,
    fork_image     TEXT,
    decision       TEXT,                 -- approved | rejected | auto | pending
    decision_note  TEXT,
    created_at     REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS steps_run ON steps(run_id, idx);
"""


def conn() -> sqlite3.Connection:
    c = getattr(_local, "c", None)
    if c is None:
        c = sqlite3.connect(CONFIG.db_path, check_same_thread=False, timeout=30)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)
        _local.c = c
    return c


def _j(v):
    return json.dumps(v) if v is not None else None


def _u(s):
    return json.loads(s) if s else None


# ------------------------------------------------------------------ runs
def create_run(task: str, scenario: str | None = None, replay_of: str | None = None) -> str:
    rid = uuid.uuid4().hex[:12]
    now = time.time()
    conn().execute(
        "INSERT INTO runs (id, task, scenario, status, created_at, updated_at, replay_of) "
        "VALUES (?,?,?,?,?,?,?)",
        (rid, task, scenario, "running", now, now, replay_of),
    )
    conn().commit()
    return rid


def update_run(run_id: str, **fields) -> None:
    if not fields:
        return
    fields["updated_at"] = time.time()
    for k in ("budget_json",):
        if k in fields and not isinstance(fields[k], str):
            fields[k] = _j(fields[k])
    sets = ", ".join(f"{k}=?" for k in fields)
    conn().execute(f"UPDATE runs SET {sets} WHERE id=?", (*fields.values(), run_id))
    conn().commit()


def get_run(run_id: str) -> dict | None:
    row = conn().execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["budget"] = _u(d.pop("budget_json", None))
    d["steps"] = get_steps(run_id)
    return d


def list_runs(limit: int = 50) -> list[dict]:
    rows = conn().execute(
        "SELECT id, task, scenario, status, created_at, updated_at, replay_of "
        "FROM runs ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


# ----------------------------------------------------------------- steps
def add_step(run_id: str, idx: int, kind: str, **f) -> str:
    sid = uuid.uuid4().hex[:12]
    conn().execute(
        "INSERT INTO steps (id, run_id, idx, kind, cmd, risk, intent_json, premise_json, "
        "changeset_json, verdict_json, exec_output, parent_image, fork_image, decision, "
        "decision_note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            sid, run_id, idx, kind,
            f.get("cmd"), f.get("risk"),
            _j(f.get("intent")), _j(f.get("premise")),
            _j(f.get("changeset")), _j(f.get("verdict")),
            f.get("exec_output"), f.get("parent_image"), f.get("fork_image"),
            f.get("decision", "pending"), f.get("decision_note"),
            time.time(),
        ),
    )
    conn().commit()
    return sid


def set_decision(step_id: str, decision: str, note: str | None = None) -> None:
    conn().execute(
        "UPDATE steps SET decision=?, decision_note=? WHERE id=?", (decision, note, step_id)
    )
    conn().commit()


def get_steps(run_id: str) -> list[dict]:
    rows = conn().execute("SELECT * FROM steps WHERE run_id=? ORDER BY idx", (run_id,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["intent"] = _u(d.pop("intent_json"))
        d["premise"] = _u(d.pop("premise_json"))
        d["changeset"] = _u(d.pop("changeset_json"))
        d["verdict"] = _u(d.pop("verdict_json"))
        out.append(d)
    return out


def pending_step(run_id: str) -> dict | None:
    for s in get_steps(run_id):
        if s["decision"] == "pending" and s["kind"] in ("gated", "blocked"):
            return s
    return None
