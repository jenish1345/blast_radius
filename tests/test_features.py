import pytest
from fastapi.testclient import TestClient
from api.main import app
from core import scorer, report, tracker
from core.llm import Budget

client = TestClient(app)

def test_blast_radius_scorer():
    # Safe diff
    safe_diff = {
        "added": ["/tmp/test.txt"],
        "removed": [],
        "modified": [],
        "total": 1,
        "total_paths": ["/tmp/test.txt"]
    }
    safe_res = scorer.compute_blast_radius(safe_diff)
    assert safe_res["tier"] in ("GREEN", "YELLOW")
    assert 0.0 <= safe_res["score"] <= 1.0

    # Risky diff with sensitive paths
    risky_diff = {
        "added": [],
        "removed": ["/etc/shadow", "/etc/sudoers", "/bin/bash"],
        "modified": ["/etc/passwd"],
        "total": 4,
        "total_paths": ["/etc/shadow", "/etc/sudoers", "/bin/bash", "/etc/passwd"]
    }
    risky_res = scorer.compute_blast_radius(risky_diff)
    assert risky_res["tier"] == "RED"
    assert risky_res["score"] > 0.5
    assert risky_res["breakdown"]["sensitivity"] > 0.5

def test_intent_tracker_single_step():
    session_state = {"session_id": "test-session", "step_log": []}
    step = {
        "step_id": "step-1",
        "timestamp": 123456789.0,
        "declared_intent": "inspect logs",
        "observed_diff": {},
        "drift_score": None,
        "blast_score": 0.0,
    }
    res = tracker.track_intent(session_state, step, Budget())
    assert res["step_count"] == 1
    assert res["flags"]["goal_drift"] is False
    assert len(session_state["step_log"]) == 1

def test_report_builder_schema():
    session_state = {
        "session_id": "test-session",
        "step_log": [{
            "declared_intent": "rotate log files",
            "final_plan": "logrotate -f",
            "verdict": "ALLOWED",
            "block_reason": None
        }],
        "blast_radius": {"score": 0.15, "tier": "GREEN", "breakdown": {"scope": 0.1, "reversibility": 0.1, "sensitivity": 0.0, "spread": 0.0}},
        "premise_results": [{"assumption": "logrotate installed", "criticality": "minor", "status": "CONFIRMED", "evidence": "standard tool", "tavily_url": None, "error": None}],
        "refinement_log": [{"iteration": 1, "original_cmd": "rm /log/*", "refined_cmd": "logrotate", "diff": {}, "verdict": "CLEAN", "gap": 0.0, "converged": True, "rationale": "cleaner"}],
        "intent_tracking": {"flags": {"goal_drift": False, "scope_creep": False, "contradiction": False}, "explanation": "Consistent", "step_count": 1},
        "counterfactuals": []
    }
    rep = report.build_report(session_state)
    for key in ("report_id", "timestamp", "action", "blast_radius", "premise_check", "refinement", "intent_tracking", "counterfactuals"):
        assert key in rep
    assert rep["action"]["verdict"] == "ALLOWED"
    assert rep["blast_radius"]["tier"] == "GREEN"
    assert rep["refinement"]["converged"] is True

def test_api_envelope_structure():
    diff = {"added": ["/tmp/out.log"], "removed": [], "modified": [], "total": 1, "total_paths": ["/tmp/out.log"]}
    res = client.post("/api/score", json={"sandbox_diff": diff, "session_id": "sess-test"})
    assert res.status_code == 200
    body = res.json()
    assert body["session_id"] == "sess-test"
    assert body["feature"] == "blast_radius_score"
    assert body["status"] == "success"
    assert "data" in body
    assert body["error"] is None
