/**
 * BLAST RADIUS — API Client
 * 
 * Unwraps all envelopes {session_id, feature, status, data, error} in one place.
 * Routes errors to an inline notice UI without using alert().
 */

let _noticeHandler = null;

export function setNoticeHandler(fn) {
  _noticeHandler = fn;
}

export function showNotice(title, message, nextStep = "", isError = true) {
  if (_noticeHandler) {
    _noticeHandler({ title, message, nextStep, isError });
  } else {
    console.warn(`[Notice] ${title}: ${message} (${nextStep})`);
  }
}

async function request(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (!res.ok) {
      let errText = await res.text();
      try {
        const j = JSON.parse(errText);
        errText = j.detail || j.message || errText;
      } catch (_) {}
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const payload = await res.json();

    // Check if envelope structure is present: {session_id, feature, status, data, error}
    if (payload && typeof payload === "object" && "status" in payload && "feature" in payload) {
      if (payload.status === "error" || payload.error) {
        const err = payload.error || "The feature execution encountered an error.";
        showNotice(`Feature "${payload.feature}" failed`, err, "Check system logs or verify model/Tavily API credentials.");
        return payload;
      }
      return payload;
    }

    return payload;
  } catch (err) {
    showNotice("API Request Failed", err.message, "Verify that uvicorn is running on port 8000 and network connection is active.");
    throw err;
  }
}

export async function fetchHealth() {
  return request("/api/health");
}

export async function fetchScenarios() {
  return request("/api/scenarios");
}

export async function fetchRuns() {
  return request("/api/runs");
}

export async function fetchRun(runId) {
  return request(`/api/runs/${runId}`);
}

export async function startRun({ scenario, task }) {
  return request("/api/runs", {
    method: "POST",
    body: JSON.stringify({ scenario, task })
  });
}

export async function decideRun(runId, { decision, note = "" }) {
  return request(`/api/runs/${runId}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, note })
  });
}

export async function refineAction({ session_id = "standalone", command, drift_diff = {}, declared_intent = "", task = "" }) {
  return request("/api/refine", {
    method: "POST",
    body: JSON.stringify({ session_id, command, drift_diff, declared_intent, task })
  });
}

export async function checkPremises({ declared_intent, session_id = "standalone" }) {
  return request("/api/premises", {
    method: "POST",
    body: JSON.stringify({ declared_intent, session_id })
  });
}

export async function scoreAction({ sandbox_diff, session_id = "standalone" }) {
  return request("/api/score", {
    method: "POST",
    body: JSON.stringify({ sandbox_diff, session_id })
  });
}

export async function getTracker(sessionId) {
  return request(`/api/session/${sessionId}/tracker`);
}

export async function generateCounterfactual({ blocked_action_context, session_id = "standalone" }) {
  return request("/api/counterfactual", {
    method: "POST",
    body: JSON.stringify({ blocked_action_context, session_id })
  });
}

export async function getReport(sessionId) {
  return request(`/api/report/${sessionId}`);
}
