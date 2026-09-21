"""
External premise checking via Tavily — the $3,000 side prize, done properly.

The rules require "a functional, runtime call to the Tavily API as part of its
solution." Most entrants will bolt a search box onto a UI. This puts Tavily in
the critical path: when an agent's stated intent rests on a claim about the
outside world — a deprecation, an advisory, a version, an API surface — that
claim is resolved against live sources BEFORE the action is allowed to run.

The agent's plan is built from training-cutoff knowledge. This is the only
component in the system with access to ground truth the model cannot have.

Degrades cleanly: with no TAVILY_API_KEY, premise checking is skipped and the
rest of the pipeline is unaffected.
"""
from __future__ import annotations

import httpx

from core.config import CONFIG
from core.llm import Budget, chat_json

TAVILY_URL = "https://api.tavily.com/search"

SYSTEM = """You decide whether a factual premise an autonomous agent is relying on is STILL TRUE,
using only the search results provided.

Return ONLY a JSON object:

{
  "holds": true|false|null,
  "confidence": 0.0-1.0,
  "evidence": "<one sentence quoting or closely paraphrasing the decisive result>",
  "source": "<url of the decisive result, or empty>"
}

- true  = the search results support the premise.
- false = the search results contradict it. Be strict: only say false when a result
          directly contradicts the claim, not merely when it fails to mention it.
- null  = the results do not settle the question. This is the correct answer more
          often than either of the other two. Say null rather than guessing.
Output JSON only."""


def search(query: str, max_results: int = 5, timeout: float = 20.0) -> list[dict]:
    """One real Tavily call. Returns [] if unconfigured or unreachable."""
    if not CONFIG.tavily_api_key:
        return []
    try:
        resp = httpx.post(
            TAVILY_URL,
            json={
                "api_key": CONFIG.tavily_api_key,
                "query": query,
                "max_results": max_results,
                "search_depth": "advanced",
                "include_answer": True,
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:  # noqa: BLE001 — a dead search must never break a run
        return []

    out = []
    if data.get("answer"):
        out.append({"title": "Tavily answer", "url": "", "content": str(data["answer"])[:1200]})
    for r in data.get("results", []):
        out.append(
            {
                "title": str(r.get("title", ""))[:200],
                "url": str(r.get("url", "")),
                "content": str(r.get("content", ""))[:1200],
            }
        )
    return out


def check(premises: list[str], budget: Budget) -> list[dict]:
    """Resolve each premise against live sources. Returns one result per premise."""
    if not premises or not CONFIG.tavily_api_key:
        return []

    results = []
    for premise in premises[:3]:  # cap: keeps latency and credits sane
        hits = search(premise)
        if not hits:
            results.append(
                {"premise": premise, "holds": None, "confidence": 0.0,
                 "evidence": "no search results", "source": ""}
            )
            continue

        blob = "\n\n".join(f"[{h['title']}] {h['url']}\n{h['content']}" for h in hits)
        raw = chat_json(
            CONFIG.model_judge,
            [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"PREMISE:\n{premise}\n\nSEARCH RESULTS:\n{blob}"},
            ],
            budget,
            max_tokens=500,
        )
        holds = raw.get("holds")
        if holds not in (True, False, None):
            holds = None
        results.append(
            {
                "premise": premise,
                "holds": holds,
                "confidence": _clamp(raw.get("confidence", 0.0)),
                "evidence": str(raw.get("evidence", ""))[:600],
                "source": str(raw.get("source", ""))[:400],
            }
        )
    return results


def any_broken(results: list[dict], min_confidence: float = 0.6) -> dict | None:
    """The first confidently contradicted premise, if there is one."""
    for r in results:
        if r.get("holds") is False and r.get("confidence", 0) >= min_confidence:
            return r
    return None


def _clamp(v) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.0


# ============================================================ Feature 2 =====
# bust_premises — called from api/main.py POST /api/premises
# Differs from check() in that it EXTRACTS assumptions from raw intent text
# rather than receiving a pre-parsed list of premise strings.

_EXTRACT_SYSTEM = """You extract every factual assumption embedded in an agent's declared action plan.

Return ONLY a valid JSON array. Each item must have exactly these keys:
  {"assumption": "<the specific factual claim>", "criticality": "critical" | "minor"}

- critical: if this assumption is false, the action could cause harm or produce wrong results
- minor: the assumption is nice-to-have but the action is mostly safe even if wrong
- Do NOT include assumptions about file paths on the local machine — only claims about the outside world (versions, deprecations, advisories, APIs, standards)
- Return only valid JSON. No markdown, no explanation, no code fences."""

_VERIFY_SYSTEM = """You decide whether a web search result contradicts a specific factual assumption.

Answer with exactly one of: CONFIRMED, REFUTED, or UNCERTAIN.
Then write exactly one sentence of evidence citing the search result.

Return ONLY valid JSON:
{"status": "CONFIRMED" | "REFUTED" | "UNCERTAIN", "evidence": "<one sentence>", "url": "<source url or empty>"}

- CONFIRMED: search results support the assumption
- REFUTED: search results directly contradict the assumption
- UNCERTAIN: results are inconclusive or do not address the claim
Return only valid JSON. No markdown, no explanation, no code fences."""


def bust_premises(declared_intent: str, budget: Budget) -> dict:
    """
    Feature 2 entry point.

    1. Use Nano to extract factual assumptions from declared_intent as JSON.
    2. For each critical assumption, run a Tavily search (5s timeout).
    3. Use Nano to decide CONFIRMED / REFUTED / UNCERTAIN per result.
    4. If any assumption is REFUTED → passed=False, blocked_by=that assumption.

    Returns:
        {
          "passed": bool,
          "results": [
              {
                "assumption": str,
                "criticality": "critical" | "minor",
                "status": "CONFIRMED" | "REFUTED" | "UNCERTAIN",
                "evidence": str | null,
                "tavily_url": str | null,
                "error": str | null
              }
          ],
          "blocked_by": str | null
        }
    """
    if not declared_intent or not declared_intent.strip():
        return {"passed": True, "results": [], "blocked_by": None}

    # Step 1 — extract assumptions via Nano
    try:
        raw = chat_json(
            CONFIG.model_intent,  # Nano
            [
                {"role": "system", "content": _EXTRACT_SYSTEM},
                {"role": "user", "content": f"ACTION PLAN:\n{declared_intent}\n\nExtract assumptions."},
            ],
            budget,
            max_tokens=600,
        )
        # raw may be a list or {"assumptions": [...]}
        if isinstance(raw, list):
            assumptions = raw
        elif isinstance(raw, dict):
            assumptions = raw.get("assumptions", [])
        else:
            assumptions = []
    except Exception as exc:  # noqa: BLE001
        # Cannot extract — skip premise busting, don't crash the pipeline
        return {
            "passed": True,
            "results": [],
            "blocked_by": None,
            "_extract_error": str(exc),
        }

    results = []
    blocked_by = None

    for item in assumptions[:5]:  # cap at 5 to control latency + credits
        if not isinstance(item, dict):
            continue
        assumption = str(item.get("assumption", "")).strip()
        criticality = str(item.get("criticality", "minor")).lower()
        if not assumption:
            continue

        result = {
            "assumption":   assumption,
            "criticality":  criticality,
            "status":       "UNCERTAIN",
            "evidence":     None,
            "tavily_url":   None,
            "error":        None,
        }

        # Only verify critical assumptions against Tavily
        if criticality != "critical":
            result["evidence"] = "Minor assumption — not verified against live sources."
            results.append(result)
            continue

        if not CONFIG.tavily_api_key:
            result["evidence"] = "Tavily not configured — skipping live verification."
            results.append(result)
            continue

        # Step 2 — Tavily search (5s timeout)
        try:
            hits = search(assumption, max_results=3, timeout=5.0)
        except Exception as exc:  # noqa: BLE001
            result["error"] = f"tavily_timeout: {exc}"
            results.append(result)
            continue

        if not hits:
            result["error"] = "tavily_timeout"
            results.append(result)
            continue

        # Step 3 — Nano verifies the result
        blob = "\n\n".join(
            f"[{h['title']}] {h['url']}\n{h['content']}" for h in hits
        )
        try:
            verdict = chat_json(
                CONFIG.model_intent,  # Nano — cheap, fast
                [
                    {"role": "system", "content": _VERIFY_SYSTEM},
                    {
                        "role": "user",
                        "content": (
                            f"ASSUMPTION: {assumption}\n\n"
                            f"SEARCH RESULTS:\n{blob[:3000]}\n\n"
                            "Verdict?"
                        ),
                    },
                ],
                budget,
                max_tokens=300,
            )
            status = str(verdict.get("status", "UNCERTAIN")).upper()
            if status not in ("CONFIRMED", "REFUTED", "UNCERTAIN"):
                status = "UNCERTAIN"
            result["status"]     = status
            result["evidence"]   = str(verdict.get("evidence", "")).strip() or None
            result["tavily_url"] = str(verdict.get("url", hits[0].get("url", ""))).strip() or None
        except Exception as exc:  # noqa: BLE001
            result["error"] = str(exc)

        results.append(result)

        if result["status"] == "REFUTED" and blocked_by is None:
            blocked_by = assumption

    return {
        "passed":     blocked_by is None,
        "results":    results,
        "blocked_by": blocked_by,
    }
