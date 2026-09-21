"""
Forensic Report Builder — Feature 6.

Aggregates all five feature outputs from session_state into a single
structured JSON document matching the exact schema specified.

All null fields are explicitly present — never omitted.
"""
from __future__ import annotations

import time
import uuid


def build_report(session_state: dict) -> dict:
    """
    Build the complete forensic report from session_state.

    Returns the exact schema:
    {
      "report_id": str,
      "timestamp": str (ISO8601),
      "action": {...},
      "blast_radius": {...},
      "premise_check": {...},
      "refinement": {...},
      "intent_tracking": {...},
      "counterfactuals": [...]
    }

    All null fields are explicitly present.
    """
    # ---------------------------------------------------------------- action
    last_step = _last_step(session_state)
    declared_intent = last_step.get("declared_intent", "")
    final_plan      = last_step.get("final_plan", declared_intent)
    verdict_str     = last_step.get("verdict", "ALLOWED")
    block_reason    = last_step.get("block_reason", None)

    action = {
        "declared_intent": declared_intent or None,
        "final_plan":      final_plan or None,
        "verdict":         verdict_str if verdict_str in ("ALLOWED", "BLOCKED") else "ALLOWED",
        "block_reason":    block_reason,
    }

    # ---------------------------------------------------------------- blast_radius
    br = session_state.get("blast_radius") or {}
    blast_radius = {
        "score":     br.get("score", None),
        "tier":      br.get("tier", None),
        "breakdown": br.get("breakdown", None),
    }

    # ---------------------------------------------------------------- premise_check
    premise_results = session_state.get("premise_results") or []
    blocked_by = next(
        (r.get("assumption", r.get("premise", "")) for r in premise_results
         if r.get("status") == "REFUTED" or r.get("holds") is False),
        None,
    )
    premise_check = {
        "passed":     blocked_by is None,
        "results":    premise_results,
        "blocked_by": blocked_by,
    }

    # ---------------------------------------------------------------- refinement
    refinement_log = session_state.get("refinement_log") or []
    converged = None
    if refinement_log:
        last_iter = refinement_log[-1]
        converged = bool(last_iter.get("converged", False))

    refinement = {
        "converged":  converged,
        "iterations": len(refinement_log),
        "log":        refinement_log,
    }

    # ---------------------------------------------------------------- intent_tracking
    tracking = session_state.get("intent_tracking") or {}
    intent_tracking = {
        "flags":       tracking.get("flags", {"goal_drift": None, "scope_creep": None, "contradiction": None}),
        "explanation": tracking.get("explanation", None),
        "step_count":  tracking.get("step_count", len(session_state.get("step_log", []))),
    }

    # ---------------------------------------------------------------- counterfactuals
    counterfactuals = session_state.get("counterfactuals") or []

    # ---------------------------------------------------------------- assemble
    report = {
        "report_id":       uuid.uuid4().hex,
        "timestamp":       _iso_now(),
        "action":          action,
        "blast_radius":    blast_radius,
        "premise_check":   premise_check,
        "refinement":      refinement,
        "intent_tracking": intent_tracking,
        "counterfactuals": counterfactuals,
    }

    session_state["report"] = report
    return report


# ------------------------------------------------------------------ helpers

def _last_step(session_state: dict) -> dict:
    """Get the most recent step from the step log."""
    step_log = session_state.get("step_log") or []
    return step_log[-1] if step_log else {}


def _iso_now() -> str:
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
