"""
Intent extraction — the artifact nothing else in this category has.

Runs on every action, before it executes, using nemotron-3-nano-30b. Cheap and
fast is the whole requirement: ~800 tokens per action, roughly $0.00006. NVIDIA
tunes Nano for software debugging and summarisation, which is precisely this job.

Observability records what happened. This records what the agent MEANT to do.
Without it, "the backend changed" is the only question you can ask.
"""
from __future__ import annotations

from core.config import CONFIG
from core.llm import Budget, chat_json

SYSTEM = """You extract the INTENT behind a single action an autonomous agent is about to take.

You are not judging the action. You are recording, in checkable terms, what the agent
appears to believe it is doing, so that the ACTUAL effect can later be compared against it.

Return ONLY a JSON object with exactly these keys:

{
  "believes": "<one sentence, the agent's own goal for this action, in plain language>",
  "expects_to_change": ["<concrete, checkable effects, e.g. '/logs/*.log with mtime older than 30 days'>"],
  "must_not_touch": ["<things this action should leave alone, inferred from the task and the action's own scope>"],
  "external_premises": ["<factual claims about the outside world this action depends on, e.g. 'library X deprecated option Y'>"],
  "reversible": true|false
}

Rules:
- "expects_to_change" must be specific enough that someone holding a file diff could
  decide whether the diff matches. "files" is useless. "log files older than 30 days" is useful.
- "must_not_touch" is where scope lives. If the task says "older than 30 days", then
  files NEWER than 30 days belong in must_not_touch. Be explicit about that boundary.
- "external_premises" is only for claims about the world outside this machine —
  deprecations, versions, advisories, API surfaces. Leave it [] if there are none.
  Do not put file paths here.
- "reversible" is false for deletions, overwrites, network sends, and package installs.
- Output JSON only. No prose, no code fences."""


def extract(
    task: str,
    cmd: str,
    recent: list[dict],
    budget: Budget,
    step: int,
    parent_image: str,
) -> dict:
    """Build the intent record for one proposed action."""
    context = "\n".join(
        f"{m['role']}: {str(m.get('content') or '')[:400]}" for m in recent[-6:]
    )
    user = (
        f"OVERALL TASK GIVEN TO THE AGENT:\n{task}\n\n"
        f"RECENT CONVERSATION:\n{context}\n\n"
        f"ACTION ABOUT TO RUN (shell):\n{cmd}\n\n"
        "Extract the intent."
    )
    raw = chat_json(
        CONFIG.model_intent,
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
        budget,
        max_tokens=700,
    )
    return {
        "step": step,
        "parent_image": parent_image,
        "action": {"tool": "shell", "args": {"cmd": cmd}},
        "believes": str(raw.get("believes", "")).strip(),
        "expects_to_change": _strlist(raw.get("expects_to_change")),
        "must_not_touch": _strlist(raw.get("must_not_touch")),
        "external_premises": _strlist(raw.get("external_premises")),
        "reversible": bool(raw.get("reversible", False)),
    }


def _strlist(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [v] if v.strip() else []
    return [str(x).strip() for x in v if str(x).strip()]
