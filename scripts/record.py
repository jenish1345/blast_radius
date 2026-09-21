"""
Record real runs so the hosted demo never depends on live inference.

    python scripts/record.py drift
    python scripts/record.py --all --auto-reject

Token Factory rate limits are dynamic. If a judge opens your demo at peak and
gets a 429, every other score you earned is irrelevant. These recordings are the
insurance policy — and they are REAL RUNS stored in the same SQLite tables the
live path writes to, not fixtures. The UI cannot tell the difference because
there is no difference.

Label them as recordings in the UI and in your README. Never present a recording
as a live run; that is the one thing that would actually cost you the hackathon.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

sys.path.insert(0, ".")

from core import loop, store  # noqa: E402

SCEN = pathlib.Path("scenarios")


def record(name: str, decision: str, note: str, timeout: int = 900) -> str:
    spec = json.loads((SCEN / f"{name}.json").read_text())
    print(f"\n=== recording scenario: {name} — {spec['title']}")
    rid = loop.launch(spec["task"], spec.get("seed", []), scenario=name)
    run = loop.get(rid)
    start = time.time()
    answered = 0

    while time.time() - start < timeout:
        time.sleep(1.0)
        r = store.get_run(rid)
        if not r:
            continue
        if r["status"] == "awaiting_decision":
            pending = store.pending_step(rid)
            if pending:
                v = (pending.get("verdict") or {}).get("verdict")
                print(f"    gate hit at step {pending['idx']}: {v} -> {decision}")
                run.decide(decision, note)
                answered += 1
        if r["status"] in ("done", "failed", "stopped"):
            print(f"    finished: {r['status']}  gates answered: {answered}")
            if r.get("error"):
                print(f"    error: {r['error'][:400]}")
            if r.get("budget"):
                print(f"    cost: ${r['budget'].get('usd', 0):.4f}")
            return rid

    print("    !! timed out")
    return rid


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario", nargs="?", help="scenario name, e.g. drift")
    ap.add_argument("--all", action="store_true", help="record every scenario")
    ap.add_argument("--auto-reject", action="store_true", help="reject at every gate (default)")
    ap.add_argument("--auto-approve", action="store_true", help="approve at every gate")
    ap.add_argument(
        "--note",
        default="Scope was wider than the stated intent. Restrict to files older than 30 days.",
        help="operator note sent back to the agent on rejection",
    )
    args = ap.parse_args()

    decision = "approved" if args.auto_approve else "rejected"

    names = (
        [p.stem for p in sorted(SCEN.glob("*.json"))]
        if args.all
        else ([args.scenario] if args.scenario else [])
    )
    if not names:
        ap.error("give a scenario name or --all")

    ids = []
    for n in names:
        ids.append(record(n, decision, args.note))

    print("\nrecorded run ids:", ", ".join(ids))
    print("They now appear in the UI's 'Recorded runs' dropdown and survive a server restart.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
