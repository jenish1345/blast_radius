"""
Blast Radius Score — Feature 3.

Computes a single numeric score (0.0–1.0) representing how dangerous the
observed sandbox diff is, independent of intent match. A perfectly-matching
action can still score RED if it touches critical resources.

Components (equal-ish weight):
  scope        25%  — how many files/dirs were touched
  reversibility 30%  — are the changes undoable?
  sensitivity   25%  — did the diff touch sensitive paths?
  spread        20%  — ratio of changed to total files in scope

Thresholds:
  GREEN  0.0 – 0.3   safe to execute
  YELLOW 0.3 – 0.6   requires confirmation
  RED    0.6 – 1.0   blocked automatically
"""
from __future__ import annotations

import re

# ------------------------------------------------------------------ constants

GREEN = "GREEN"
YELLOW = "YELLOW"
RED = "RED"

TIER_GREEN_MAX = 0.3
TIER_YELLOW_MAX = 0.6

# Patterns that mark a path as sensitive.
_SENSITIVE = re.compile(
    r"(\.env$|\.env\.|secrets?|credential|password|passwd|shadow|"
    r"private[_\-]?key|id_rsa|id_ed25519|authorized_keys|"
    r"/etc/(?:passwd|shadow|sudoers|ssh|cron|hosts)|"
    r"/root/|/proc/|/sys/|\.pem$|\.key$|\.p12$|\.pfx$|"
    r"aws[_\-]?credentials|\.aws/|vault|\.pgpass)",
    re.IGNORECASE,
)

# ------------------------------------------------------------------ scorer

def compute_blast_radius(sandbox_diff: dict) -> dict:
    """
    Compute the Blast Radius Score from a raw ConTree diff dict.

    The sandbox_diff is expected to have at least these keys (as produced by
    core/diff.py → Changeset.to_dict()):
        added:    list[str]
        removed:  list[str]
        modified: list[str]
        total:    int
        truncated: bool

    Returns:
        {
          "score": float,
          "tier": "GREEN" | "YELLOW" | "RED",
          "breakdown": {
              "scope": float,
              "reversibility": float,
              "sensitivity": float,
              "spread": float
          }
        }
    """
    if not sandbox_diff:
        return _zero()

    added    = sandbox_diff.get("added", []) or []
    removed  = sandbox_diff.get("removed", []) or []
    modified = sandbox_diff.get("modified", []) or []
    total    = sandbox_diff.get("total", 0) or (len(added) + len(removed) + len(modified))

    all_changed = list(added) + list(removed) + list(modified)
    n_changed = len(all_changed)

    # --- scope score (25%) -------------------------------------------------
    # 0 files → 0.0; 1–5 files → 0.2; 6–20 → 0.5; 21–100 → 0.8; 100+ → 1.0
    if n_changed == 0:
        scope_score = 0.0
    elif n_changed <= 5:
        scope_score = 0.2
    elif n_changed <= 20:
        scope_score = 0.5
    elif n_changed <= 100:
        scope_score = 0.8
    else:
        scope_score = 1.0

    # --- reversibility score (30%) -----------------------------------------
    # deletions (removed) are irreversible → 1.0
    # writes/modifications → 0.5
    # reads only → 0.0
    if not all_changed:
        reversibility_score = 0.0
    else:
        irrev = len(removed)
        partial = len(added) + len(modified)
        reversibility_score = (irrev * 1.0 + partial * 0.5) / max(n_changed, 1)
        reversibility_score = min(reversibility_score, 1.0)

    # --- sensitivity score (25%) -------------------------------------------
    # fraction of changed files matching sensitive patterns; clamped to 1.0
    if not all_changed:
        sensitivity_score = 0.0
    else:
        hits = sum(1 for p in all_changed if _SENSITIVE.search(str(p)))
        sensitivity_score = min(hits / max(n_changed, 1) * 3.0, 1.0)
        # ×3 amplifier: even one sensitive file in ten should push score up

    # --- spread score (20%) ------------------------------------------------
    # ratio of changed to total known files; if total unknown, use n_changed as proxy
    if total <= 0:
        spread_score = 0.0
    else:
        spread_score = min(n_changed / total, 1.0)

    # --- composite ----------------------------------------------------------
    score = (
        scope_score        * 0.25 +
        reversibility_score * 0.30 +
        sensitivity_score  * 0.25 +
        spread_score       * 0.20
    )
    score = round(min(max(score, 0.0), 1.0), 4)

    return {
        "score": score,
        "tier": _tier(score),
        "breakdown": {
            "scope":          round(scope_score, 4),
            "reversibility":  round(reversibility_score, 4),
            "sensitivity":    round(sensitivity_score, 4),
            "spread":         round(spread_score, 4),
        },
    }


def _tier(score: float) -> str:
    if score < TIER_GREEN_MAX:
        return GREEN
    if score < TIER_YELLOW_MAX:
        return YELLOW
    return RED


def _zero() -> dict:
    return {
        "score": 0.0,
        "tier": GREEN,
        "breakdown": {"scope": 0.0, "reversibility": 0.0, "sensitivity": 0.0, "spread": 0.0},
    }
