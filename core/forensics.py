"""
End-of-run forensic report — nemotron-3-ultra-550b-a55b.

This is the one place a 1M-token context window genuinely earns its keep: the
whole trace of a run, every intent and every verdict, read at once so the model
can explain what happened across steps rather than within one.

Runs exactly once per run, so its cost (~$0.04) is irrelevant to the hot path.
"""
from __future__ import annotations

import json

from core import store
from core.config import CONFIG
from core.llm import Budget, chat

SYSTEM = """You write the incident report for a completed agent run that was supervised by a
preflight gate.

Write for an operations lead who was not watching. Be concrete and short. Use this shape:

## What the agent was asked to do
## What it actually did
## What the gate caught
For each blocked action: what the agent said it intended, what the fork diff really showed,
and why those differ. Quote counts and example paths.
## What would have happened without the gate
One paragraph. Be specific about the actual damage, not hypothetical.
## Cost

Rules: no bullet-point padding, no restating the obvious, no praise for the system.
If the gate caught nothing, say so plainly — that is a good outcome, not a failure."""


def report(run_id: str, task: str, budget: Budget) -> str:
    steps = store.get_steps(run_id)

    trace = []
    for s in steps:
        entry = {
            "step": s["idx"],
            "kind": s["kind"],
            "cmd": s["cmd"],
            "risk": s["risk"],
            "decision": s["decision"],
        }
        if s.get("intent"):
            entry["intent"] = {
                k: s["intent"].get(k)
                for k in ("believes", "expects_to_change", "must_not_touch", "reversible")
            }
        if s.get("verdict"):
            entry["verdict"] = {
                k: s["verdict"].get(k)
                for k in ("verdict", "confidence", "unexpected", "omitted", "reason")
            }
        if s.get("changeset"):
            cs = s["changeset"]
            entry["changeset"] = {
                "added": len(cs.get("added", [])),
                "removed": len(cs.get("removed", [])),
                "modified": len(cs.get("modified", [])),
                "examples": (cs.get("removed", []) + cs.get("added", []) + cs.get("modified", []))[:10],
            }
        if s.get("premise"):
            entry["premises"] = s["premise"]
        if s.get("decision_note"):
            entry["operator_note"] = s["decision_note"]
        trace.append(entry)

    user = (
        f"TASK:\n{task}\n\n"
        f"FULL TRACE (JSON):\n{json.dumps(trace, indent=1)[:400000]}\n\n"
        f"COST:\n{json.dumps(budget.snapshot(), indent=1)}\n\n"
        "Write the report."
    )
    resp = chat(
        CONFIG.model_agent if CONFIG.model_agent.endswith("ultra-550b-a55b") else CONFIG.model_judge,
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
        budget,
        max_tokens=1800,
    )
    return (resp.choices[0].message.content or "").strip()
