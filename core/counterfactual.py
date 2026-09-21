"""
Counterfactual Timeline Generator — Feature 5.

Triggered only on blocked actions (RED blast score, DRIFT never converged,
or REFUTED premise). Calls Nemotron Ultra once with the full blocking context
to generate three alternate timelines showing what would have happened if the
action had executed.

The three timelines are grounded in the actual sandbox diff and premise bust
results — not generic warnings.
"""
from __future__ import annotations

import json
import logging

from core.config import CONFIG
from core.llm import Budget, chat_json

log = logging.getLogger(__name__)

SYSTEM = """An autonomous agent action was blocked by a preflight safety gate.

You will receive the full context of the blocked action: declared intent, the actual filesystem diff the sandbox produced, the Blast Radius Score breakdown, premise check results, and the refinement history.

Generate EXACTLY THREE counterfactual timelines showing what would have happened if this action had executed without the gate. Ground your timelines in the specific files and paths named in the diff — do not be generic.

Return ONLY a valid JSON array with exactly 3 objects, each with exactly these keys:

[
  {
    "label": "Optimistic",
    "system_state": "<what the system state would look like — specific files, services, data affected>",
    "downstream_actions": "<what the agent would likely do next, given this state>",
    "recovery_hours": <number — estimated engineer-hours to undo this>
  },
  {
    "label": "Realistic",
    ...
  },
  {
    "label": "Catastrophic",
    ...
  }
]

recovery_hours must be a number (integer or float), not a string.
Return only valid JSON. No markdown, no explanation, no code fences."""


def generate_counterfactuals(blocked_action_context: dict, budget: Budget) -> list[dict]:
    """
    Generate 3 counterfactual timelines for a blocked action.

    blocked_action_context should contain:
        declared_intent: str
        observed_diff: dict
        blast_radius_breakdown: dict
        premise_bust_results: list
        refinement_log: list
        block_reason: str

    Returns a list of 3 timeline dicts, or a safe fallback list on failure.
    """
    user = (
        "BLOCKED ACTION CONTEXT:\n"
        f"{json.dumps(blocked_action_context, indent=1, default=str)[:80000]}\n\n"
        "Generate the three counterfactual timelines."
    )

    try:
        raw = chat_json(
            CONFIG.model_agent,  # Ultra — 1M context for full trace
            [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
            budget,
            max_tokens=1500,
        )
        # raw should be a list directly; if dict wrapped, unwrap
        if isinstance(raw, dict):
            timelines = raw.get("timelines", raw.get("counterfactuals", [raw]))
        elif isinstance(raw, list):
            timelines = raw
        else:
            timelines = []

        validated = []
        for t in timelines[:3]:
            if not isinstance(t, dict):
                continue
            validated.append({
                "label":               str(t.get("label", "Unknown")),
                "system_state":        str(t.get("system_state", "")),
                "downstream_actions":  str(t.get("downstream_actions", "")),
                "recovery_hours":      _num(t.get("recovery_hours", 0)),
            })

        # Pad to exactly 3 if model returned fewer
        labels = ["Optimistic", "Realistic", "Catastrophic"]
        while len(validated) < 3:
            idx = len(validated)
            validated.append({
                "label":              labels[idx],
                "system_state":       "(not generated)",
                "downstream_actions": "(not generated)",
                "recovery_hours":     0,
            })
        return validated[:3]

    except Exception as exc:  # noqa: BLE001
        log.warning("counterfactual generation failed: %s", exc)
        return _fallback(str(exc))


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _fallback(reason: str) -> list[dict]:
    labels = ["Optimistic", "Realistic", "Catastrophic"]
    return [
        {
            "label":              label,
            "system_state":       f"(unavailable — {reason})",
            "downstream_actions": "(unavailable)",
            "recovery_hours":     0,
        }
        for label in labels
    ]
