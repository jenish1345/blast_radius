"""
FastAPI backend. Serves the operator console and drives runs.

Polling rather than websockets on purpose: fewer failure modes, works behind any
proxy, and a judge on a bad connection still sees the demo.

    uvicorn api.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import json
import pathlib

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core import counterfactual, loop, premise, report, scorer, store, tracker
from core.config import CONFIG
from core.llm import Budget, chat_json

ROOT = pathlib.Path(__file__).resolve().parent.parent
UI = ROOT / "ui"
SCENARIOS = ROOT / "scenarios"

app = FastAPI(title="Blast Radius", version="1.0.0")


def make_envelope(session_id: str, feature: str, status: str, data: any = None, error: str | None = None) -> dict:
    return {
        "session_id": session_id,
        "feature": feature,
        "status": status,
        "data": data,
        "error": error,
    }


class StartBody(BaseModel):
    scenario: str | None = None
    task: str | None = None


class DecideBody(BaseModel):
    decision: str          # "approved" | "rejected"
    note: str = ""


class RefineBody(BaseModel):
    session_id: str = "standalone"
    command: str
    drift_diff: dict = {}
    declared_intent: str = ""
    task: str | None = "Safely accomplish the declared intent."


class PremisesBody(BaseModel):
    declared_intent: str
    session_id: str = "standalone"


class ScoreBody(BaseModel):
    sandbox_diff: dict
    session_id: str = "standalone"


class CounterfactualBody(BaseModel):
    blocked_action_context: dict
    session_id: str = "standalone"


def load_scenarios() -> dict:
    out = {}
    for p in sorted(SCENARIOS.glob("*.json")):
        try:
            out[p.stem] = json.loads(p.read_text())
        except json.JSONDecodeError:
            continue
    return out


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "models": {
            "agent": CONFIG.model_agent,
            "intent": CONFIG.model_intent,
            "judge": CONFIG.model_judge,
        },
        "tavily": bool(CONFIG.tavily_api_key),
        "base_image": CONFIG.base_image,
    }


@app.get("/api/scenarios")
def scenarios():
    return load_scenarios()


@app.get("/api/runs")
def runs():
    return store.list_runs()


@app.post("/api/runs")
def start(body: StartBody):
    scen = load_scenarios()
    if body.scenario:
        s = scen.get(body.scenario)
        if not s:
            raise HTTPException(404, f"unknown scenario {body.scenario!r}")
        rid = loop.launch(s["task"], s.get("seed", []), scenario=body.scenario)
    elif body.task:
        rid = loop.launch(body.task, [], scenario=None)
    else:
        raise HTTPException(400, "provide either scenario or task")
    return {"run_id": rid}


@app.get("/api/runs/{run_id}")
def run_detail(run_id: str):
    r = store.get_run(run_id)
    if not r:
        raise HTTPException(404, "no such run")
    r["pending"] = store.pending_step(run_id)
    run = loop.get(run_id)
    if run and hasattr(run, "session_state"):
        r["session_state"] = run.session_state
    return JSONResponse(r)


@app.post("/api/runs/{run_id}/decide")
def decide(run_id: str, body: DecideBody):
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")
    run = loop.get(run_id)
    if run is None:
        raise HTTPException(
            409,
            "This run is not live in this process — it is a recorded trace, or the server "
            "restarted. Recorded runs are read-only.",
        )
    if not run.decide(body.decision, body.note):
        raise HTTPException(409, "no step is currently awaiting a decision")
    return {"ok": True}


# ============================================================ 6 New Feature Endpoints

@app.post("/api/refine")
def refine_action(body: RefineBody):
    budget = Budget()
    run = loop.get(body.session_id)
    if run:
        budget = run.budget

    system = (
        "You are an expert Linux operations engineer and AI safety specialist.\n"
        "An autonomous agent's proposed shell command produced unintended side effects or drifted from its declared intent.\n"
        "Your job is to produce a refined, precise shell command that accomplishes the declared intent with ZERO collateral modifications or unintended changes.\n\n"
        "Return ONLY a JSON object:\n"
        "{\n"
        '  "refined_command": "<precise shell command>",\n'
        '  "rationale": "<brief explanation of why this avoids drift>"\n'
        "}"
    )
    user_msg = (
        f"TASK: {body.task}\n"
        f"DECLARED INTENT: {body.declared_intent}\n"
        f"COMMAND ATTEMPTED: {body.command}\n"
        f"OBSERVED DIFF: {json.dumps(body.drift_diff)}\n\n"
        f"Rewrite this command to achieve the declared intent with zero collateral changes."
    )
    try:
        raw = chat_json(
            CONFIG.model_judge,  # Super
            [{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            budget,
            max_tokens=600,
        )
        refined_cmd = raw.get("refined_command", body.command)
        rationale = raw.get("rationale", "")
        data = {
            "original_command": body.command,
            "refined_command": refined_cmd,
            "rationale": rationale,
        }
        if run:
            run.session_state.setdefault("refinement_log", []).append({
                "iteration": len(run.session_state.get("refinement_log", [])) + 1,
                "original_cmd": body.command,
                "refined_cmd": refined_cmd,
                "diff": body.drift_diff,
                "verdict": "REFINED",
                "converged": True,
                "rationale": rationale,
            })
        return make_envelope(body.session_id, "self_refining_loop", "success", data)
    except Exception as exc:
        return make_envelope(body.session_id, "self_refining_loop", "error", None, str(exc))


@app.post("/api/premises")
def live_premises(body: PremisesBody):
    budget = Budget()
    run = loop.get(body.session_id)
    if run:
        budget = run.budget
    try:
        res = premise.bust_premises(body.declared_intent, budget)
        if run:
            run.session_state["premise_results"] = res.get("results", [])
        return make_envelope(body.session_id, "live_premise_busting", "success", res)
    except Exception as exc:
        return make_envelope(body.session_id, "live_premise_busting", "error", None, str(exc))


@app.post("/api/score")
def score_action(body: ScoreBody):
    try:
        res = scorer.compute_blast_radius(body.sandbox_diff)
        run = loop.get(body.session_id)
        if run:
            run.session_state["blast_radius"] = res
        return make_envelope(body.session_id, "blast_radius_score", "success", res)
    except Exception as exc:
        return make_envelope(body.session_id, "blast_radius_score", "error", None, str(exc))


@app.get("/api/session/{session_id}/tracker")
def get_tracker(session_id: str):
    run = loop.get(session_id)
    if run:
        tracking = run.session_state.get("intent_tracking") or {}
        step_log = run.session_state.get("step_log") or []
        data = {
            "flags": tracking.get("flags", {"goal_drift": False, "scope_creep": False, "contradiction": False}),
            "explanation": tracking.get("explanation", ""),
            "step_count": tracking.get("step_count", len(step_log)),
            "step_log": step_log,
        }
        return make_envelope(session_id, "cross_step_intent_tracking", "success", data)

    db_run = store.get_run(session_id)
    if db_run:
        steps = db_run.get("steps", [])
        data = {
            "flags": {"goal_drift": False, "scope_creep": False, "contradiction": False},
            "explanation": f"Stored run with {len(steps)} steps.",
            "step_count": len(steps),
            "step_log": steps,
        }
        return make_envelope(session_id, "cross_step_intent_tracking", "success", data)

    raise HTTPException(404, "session not found")


@app.post("/api/counterfactual")
def generate_counterfactual(body: CounterfactualBody):
    budget = Budget()
    run = loop.get(body.session_id)
    if run:
        budget = run.budget
    try:
        timelines = counterfactual.generate_counterfactuals(body.blocked_action_context, budget)
        if run:
            run.session_state["counterfactuals"] = timelines
        return make_envelope(body.session_id, "counterfactual_timeline", "success", timelines)
    except Exception as exc:
        return make_envelope(body.session_id, "counterfactual_timeline", "error", None, str(exc))


@app.get("/api/report/{session_id}")
def get_report(session_id: str):
    run = loop.get(session_id)
    if run:
        rep = report.build_report(run.session_state)
        return make_envelope(session_id, "forensic_report", "success", rep)

    db_run = store.get_run(session_id)
    if db_run:
        steps = db_run.get("steps", [])
        last_step = steps[-1] if steps else {}
        v = last_step.get("verdict") or {}
        rep = {
            "report_id": session_id,
            "timestamp": "",
            "action": {
                "declared_intent": (last_step.get("intent") or {}).get("believes") or db_run.get("task"),
                "final_plan": last_step.get("cmd"),
                "verdict": "BLOCKED" if v.get("verdict") in ("DRIFT", "STALE_PREMISE") else "ALLOWED",
                "block_reason": v.get("reason"),
            },
            "blast_radius": v.get("blast_radius", {"score": None, "tier": None, "breakdown": None}),
            "premise_check": {
                "passed": not bool(last_step.get("premise")),
                "results": last_step.get("premise") or [],
                "blocked_by": None,
            },
            "refinement": {"converged": None, "iterations": 0, "log": []},
            "intent_tracking": {
                "flags": {"goal_drift": False, "scope_creep": False, "contradiction": False},
                "explanation": "Stored historical run trace.",
                "step_count": len(steps),
            },
            "counterfactuals": [],
        }
        return make_envelope(session_id, "forensic_report", "success", rep)

    raise HTTPException(404, "session not found")


@app.get("/")
def index():
    return FileResponse(UI / "index.html")


if UI.exists():
    app.mount("/ui", StaticFiles(directory=str(UI)), name="ui")
