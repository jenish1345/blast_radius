"""
The agent loop and the preflight gate.

THE ARCHITECTURAL POINT: this loop runs OUTSIDE the sandbox.

ConTree forks the filesystem image; process memory, running services and network
state are explicitly not preserved. So an agent whose loop lived inside a sandbox
could not be forked at all. Running it out here turns that constraint into the
feature: run state is the pair

        (messages: list[dict],  image_id: str)

both of which are trivially copyable. A fork is therefore a genuine counterfactual
— an independent branch of the whole world plus the whole conversation — rather
than a container snapshot.

Per action:
    1. agent proposes a shell command
    2. nano-30b records the intent
    3. deterministic classifier decides fork / no fork
    4. (if premises asserted) Tavily resolves them BEFORE anything runs
    5. execute in a FORK only; the working image is never mutated
    6. diff fork against parent — no VM boot
    7. super-120b adjudicates diff against intent
    8. CLEAN promotes the fork; DRIFT stops and waits for a human
    9. rejection feeds a corrected intent back to the agent, which retries
"""
from __future__ import annotations

import threading
import time
import traceback

from core import adjudicate as adj
from core import counterfactual as counterfactualmod
from core import diff as diffmod
from core import intent as intentmod
from core import premise as premisemod
from core import report as reportmod
from core import risk as riskmod
from core import scorer
from core import store
from core import tracker
from core.config import CONFIG
from core.llm import Budget, BudgetExceeded, chat, chat_json
from core.sandbox import Sandbox

AGENT_SYSTEM = """You are an autonomous operations agent working on a Linux machine.

You have exactly one tool: `shell`. Use it to inspect the machine and to carry out the task.

Work in small steps. Inspect before you act. When the task is complete, reply with a
final message beginning with DONE: and a one-line summary. Do not call the tool in the
same message as DONE.

If a proposed action is rejected, you will be told why. Read the reason, narrow your
approach, and try again — do not repeat the rejected command unchanged."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "shell",
            "description": "Run a shell command on the machine and return its output.",
            "parameters": {
                "type": "object",
                "properties": {"cmd": {"type": "string", "description": "The command to run."}},
                "required": ["cmd"],
            },
        },
    }
]


class Run:
    """One agent run with preflight gating. Executes on a background thread."""

    def __init__(self, task: str, seed_cmds: list[str] | None = None, scenario: str | None = None):
        self.task = task
        self.scenario = scenario
        self.seed_cmds = seed_cmds or []
        self.budget = Budget()
        self.sb = Sandbox()
        self.run_id = store.create_run(task, scenario)

        self.messages: list[dict] = [
            {"role": "system", "content": AGENT_SYSTEM},
            {"role": "user", "content": task},
        ]
        self.head: str = ""          # current working image
        self.idx = 0

        # Feature state: single session_state dict for pipeline
        self.session_state: dict = {
            "session_id": self.run_id,
            "step_log": [],
            "blast_radius": None,
            "premise_results": [],
            "refinement_log": [],
            "intent_tracking": {},
            "counterfactuals": [],
            "report": None,
        }

        # Gate handshake between the loop thread and the HTTP layer.
        self._gate = threading.Event()
        self._decision: tuple[str, str] | None = None
        self._pending_step_id: str | None = None
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------- lifecycle
    def start(self) -> str:
        self._thread = threading.Thread(target=self._safe_run, daemon=True)
        self._thread.start()
        return self.run_id

    def decide(self, decision: str, note: str = "") -> bool:
        """Called from the API when the operator approves or rejects."""
        if self._pending_step_id is None:
            return False
        self._decision = (decision, note)
        self._gate.set()
        return True

    # ----------------------------------------------------------------- setup
    def _seed(self) -> None:
        self.head = self.sb.create_root()
        for cmd in self.seed_cmds:
            res = self.sb.exec(self.head, cmd)
            self.head = res.image_id
        store.update_run(self.run_id, root_image=self.head, head_image=self.head)

    # ------------------------------------------------------------------ main
    def _safe_run(self) -> None:
        try:
            self._run()
        except BudgetExceeded as exc:
            store.update_run(self.run_id, status="stopped", error=f"budget guard: {exc}")
        except Exception as exc:  # noqa: BLE001
            store.update_run(
                self.run_id, status="failed",
                error=f"{exc.__class__.__name__}: {exc}\n{traceback.format_exc()[-2000:]}",
            )
        finally:
            store.update_run(self.run_id, budget_json=self.budget.snapshot())

    def _run(self) -> None:
        self._seed()

        while self.idx < CONFIG.max_steps:
            resp = chat(CONFIG.model_agent, self.messages, self.budget, tools=TOOLS, max_tokens=1200)
            msg = resp.choices[0].message
            calls = getattr(msg, "tool_calls", None)

            if not calls:
                text = (msg.content or "").strip()
                self.messages.append({"role": "assistant", "content": text})
                store.add_step(self.run_id, self.idx, "thought", exec_output=text, decision="auto")
                self.idx += 1
                if text.upper().startswith("DONE") or self.idx >= CONFIG.max_steps:
                    break
                continue

            call = calls[0]
            cmd = _cmd_of(call)
            self.messages.append(
                {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {"name": "shell", "arguments": call.function.arguments},
                        }
                    ],
                }
            )

            output = self._handle_action(cmd)
            self.messages.append({"role": "tool", "tool_call_id": call.id, "content": output})
            self.idx += 1
            store.update_run(self.run_id, head_image=self.head, budget_json=self.budget.snapshot())

        self._finish()

    # -------------------------------------------------------- self-refining loop
    def _refine_loop(
        self,
        parent: str,
        cmd: str,
        intent: dict,
        initial_changeset: diffmod.Changeset,
        initial_verdict: dict,
    ) -> tuple[bool, str, str, dict, diffmod.Changeset, str]:
        """
        Attempt up to CONFIG.max_refine_iterations to re-plan the drifted action using Super.
        Returns (converged, active_fork, final_cmd, final_verdict, final_changeset, exec_output).
        """
        current_cmd = cmd
        current_verdict = initial_verdict
        current_changeset = initial_changeset
        active_fork = ""
        out = ""

        refine_system = (
            "You are an expert Linux operations engineer and AI safety specialist.\n"
            "An autonomous agent's proposed shell command produced unintended side effects or drifted from its declared intent.\n"
            "Your job is to produce a refined, precise shell command that accomplishes the declared intent with ZERO collateral modifications or unintended changes.\n\n"
            "Return ONLY a JSON object:\n"
            "{\n"
            '  "refined_command": "<precise shell command>",\n'
            '  "rationale": "<brief explanation of why this avoids drift>"\n'
            "}"
        )

        for iteration in range(1, CONFIG.max_refine_iterations + 1):
            user_msg = (
                f"TASK: {self.task}\n"
                f"DECLARED INTENT: {intent.get('believes', '')}\n"
                f"COMMAND ATTEMPTED: {current_cmd}\n"
                f"UNEXPECTED EFFECTS: {current_verdict.get('unexpected', [])}\n"
                f"OMITTED EFFECTS: {current_verdict.get('omitted', [])}\n"
                f"REASON FOR DRIFT: {current_verdict.get('reason', '')}\n\n"
                f"Rewrite this command to achieve the declared intent with zero collateral changes."
            )
            try:
                raw = chat_json(
                    CONFIG.model_judge,  # Super
                    [{"role": "system", "content": refine_system}, {"role": "user", "content": user_msg}],
                    self.budget,
                    max_tokens=600,
                )
                refined_cmd = str(raw.get("refined_command", "")).strip()
                rationale = str(raw.get("rationale", "")).strip()
            except Exception:
                break

            if not refined_cmd or refined_cmd == current_cmd:
                break

            current_cmd = refined_cmd
            res = self.sb.exec(parent, current_cmd)
            active_fork = res.image_id
            current_changeset = diffmod.compute(self.sb, parent, active_fork)
            current_verdict = adj.adjudicate(
                self.task, intent, current_changeset, self.budget, exec_summary=res.as_tool_output(1200)
            )
            br = scorer.compute_blast_radius(current_changeset.to_dict())
            current_verdict["blast_radius"] = br
            self.session_state["blast_radius"] = br

            converged = current_verdict.get("verdict") == adj.CLEAN
            out = res.as_tool_output()

            self.session_state.setdefault("refinement_log", []).append({
                "iteration": iteration,
                "original_cmd": cmd,
                "refined_cmd": current_cmd,
                "diff": current_changeset.to_dict(),
                "verdict": current_verdict.get("verdict"),
                "gap": br.get("score", 0.0),
                "converged": converged,
                "rationale": rationale,
            })

            if converged:
                return True, active_fork, current_cmd, current_verdict, current_changeset, out

        return False, active_fork, current_cmd, current_verdict, current_changeset, out

    # --------------------------------------------------------------- one action
    def _handle_action(self, cmd: str) -> str:
        kind = riskmod.classify(cmd)

        intent = intentmod.extract(
            self.task, cmd, self.messages, self.budget, self.idx, self.head
        )

        # --- premise check happens BEFORE anything is executed, even in a fork
        intent_summary = intent.get("believes", "") or intent.get("intent", "") or cmd
        bust_res = premisemod.bust_premises(intent_summary, self.budget)
        premises = bust_res.get("results", [])
        self.session_state["premise_results"] = premises

        if not bust_res.get("passed", True):
            blocked_assumption = bust_res.get("blocked_by") or "Factual assumption refuted"
            verdict = {
                "verdict": adj.STALE_PREMISE,
                "confidence": 1.0,
                "matched": [], "unexpected": [], "omitted": [],
                "reason": (
                    f"The action rests on a premise that live sources contradict: "
                    f"\"{blocked_assumption}\"."
                ),
                "changeset": None,
                "premise": premises,
            }
            blocked_ctx = {
                "declared_intent": intent.get("believes", str(intent)),
                "observed_diff": {},
                "blast_radius_breakdown": {},
                "premise_bust_results": premises,
                "refinement_log": [],
                "block_reason": verdict["reason"],
            }
            cfs = counterfactualmod.generate_counterfactuals(blocked_ctx, self.budget)
            self.session_state["counterfactuals"] = cfs

            step_id = store.add_step(
                self.run_id, self.idx, "blocked", cmd=cmd, risk=kind,
                intent=intent, premise=premises, verdict=verdict,
                parent_image=self.head, decision="pending",
            )
            track_step = {
                "step_id": step_id,
                "timestamp": time.time(),
                "declared_intent": intent.get("believes", ""),
                "final_plan": intent.get("believes", ""),
                "observed_diff": {},
                "drift_score": 1.0,
                "blast_score": None,
                "verdict": "BLOCKED",
                "block_reason": verdict["reason"],
            }
            tracker.track_intent(self.session_state, track_step, self.budget)
            return self._await_decision(step_id, cmd, verdict, fork_image=None)

        # --- safe actions execute directly. Most actions land here.
        if kind == riskmod.SAFE:
            res = self.sb.exec(self.head, cmd)
            self.head = res.image_id
            out = res.as_tool_output()
            step_id = store.add_step(
                self.run_id, self.idx, "safe_exec", cmd=cmd, risk=kind, intent=intent,
                exec_output=out, parent_image=self.head, decision="auto",
            )
            track_step = {
                "step_id": step_id,
                "timestamp": time.time(),
                "declared_intent": intent.get("believes", ""),
                "final_plan": intent.get("believes", ""),
                "observed_diff": {},
                "drift_score": None,
                "blast_score": 0.0,
                "verdict": "ALLOWED",
                "block_reason": None,
            }
            tracker.track_intent(self.session_state, track_step, self.budget)
            return out

        # --- risky: fork, execute in the fork ONLY, diff, adjudicate
        parent = self.head
        res = self.sb.exec(parent, cmd)          # returns a NEW image; parent untouched
        fork = res.image_id
        changeset = diffmod.compute(self.sb, parent, fork)
        verdict = adj.adjudicate(
            self.task, intent, changeset, self.budget, exec_summary=res.as_tool_output(1200)
        )
        verdict["premise"] = premises

        br = scorer.compute_blast_radius(changeset.to_dict())
        verdict["blast_radius"] = br
        self.session_state["blast_radius"] = br

        if verdict["verdict"] == adj.CLEAN:
            self.head = fork                      # promote the fork
            out = res.as_tool_output()
            step_id = store.add_step(
                self.run_id, self.idx, "gated", cmd=cmd, risk=kind, intent=intent,
                premise=premises, changeset=changeset.to_dict(), verdict=verdict,
                exec_output=out, parent_image=parent, fork_image=fork, decision="auto",
            )
            track_step = {
                "step_id": step_id,
                "timestamp": time.time(),
                "declared_intent": intent.get("believes", ""),
                "final_plan": intent.get("believes", ""),
                "observed_diff": changeset.to_dict(),
                "drift_score": 0.0,
                "blast_score": br.get("score", 0.0),
                "verdict": "ALLOWED",
                "block_reason": None,
            }
            tracker.track_intent(self.session_state, track_step, self.budget)
            return out

        # If DRIFT, attempt Self-Refining Loop (Feature 1) before blocking
        if verdict["verdict"] == adj.DRIFT and br.get("score", 0.0) >= CONFIG.refine_threshold:
            converged, ref_fork, ref_cmd, ref_verdict, ref_changeset, ref_out = self._refine_loop(
                parent=parent,
                cmd=cmd,
                intent=intent,
                initial_changeset=changeset,
                initial_verdict=verdict,
            )
            if converged:
                self.head = ref_fork
                step_id = store.add_step(
                    self.run_id, self.idx, "gated", cmd=ref_cmd, risk=kind, intent=intent,
                    premise=premises, changeset=ref_changeset.to_dict(), verdict=ref_verdict,
                    exec_output=ref_out, parent_image=parent, fork_image=ref_fork, decision="auto",
                )
                track_step = {
                    "step_id": step_id,
                    "timestamp": time.time(),
                    "declared_intent": intent.get("believes", ""),
                    "final_plan": ref_cmd,
                    "observed_diff": ref_changeset.to_dict(),
                    "drift_score": 0.0,
                    "blast_score": self.session_state.get("blast_radius", {}).get("score", 0.0),
                    "verdict": "ALLOWED",
                    "block_reason": None,
                }
                tracker.track_intent(self.session_state, track_step, self.budget)
                return ref_out

            verdict = ref_verdict
            changeset = ref_changeset
            fork = ref_fork
            cmd = ref_cmd

        # Blocked / pending human decision. Generate counterfactuals (Feature 5).
        blocked_ctx = {
            "declared_intent": intent.get("believes", str(intent)),
            "observed_diff": changeset.to_dict(),
            "blast_radius_breakdown": self.session_state.get("blast_radius", {}),
            "premise_bust_results": premises,
            "refinement_log": self.session_state.get("refinement_log", []),
            "block_reason": verdict.get("reason", "Drift observed"),
        }
        cfs = counterfactualmod.generate_counterfactuals(blocked_ctx, self.budget)
        self.session_state["counterfactuals"] = cfs

        step_id = store.add_step(
            self.run_id, self.idx, "gated", cmd=cmd, risk=kind, intent=intent,
            premise=premises, changeset=changeset.to_dict(), verdict=verdict,
            exec_output=res.as_tool_output(1200), parent_image=parent,
            fork_image=fork, decision="pending",
        )
        track_step = {
            "step_id": step_id,
            "timestamp": time.time(),
            "declared_intent": intent.get("believes", ""),
            "final_plan": cmd,
            "observed_diff": changeset.to_dict(),
            "drift_score": verdict.get("confidence", 1.0),
            "blast_score": self.session_state.get("blast_radius", {}).get("score", 0.0),
            "verdict": "BLOCKED",
            "block_reason": verdict.get("reason", "Action blocked due to drift"),
        }
        tracker.track_intent(self.session_state, track_step, self.budget)
        return self._await_decision(step_id, cmd, verdict, fork_image=fork)

    # ------------------------------------------------------------------- gate
    def _await_decision(self, step_id: str, cmd: str, verdict: dict, fork_image: str | None) -> str:
        self._pending_step_id = step_id
        self._gate.clear()
        store.update_run(self.run_id, status="awaiting_decision")

        self._gate.wait()                         # blocks this thread only
        decision, note = self._decision or ("rejected", "no decision recorded")
        self._decision = None
        self._pending_step_id = None
        store.set_decision(step_id, decision, note)
        store.update_run(self.run_id, status="running")

        if decision == "approved" and fork_image:
            self.head = fork_image                # promote the fork after all
            return (
                "APPROVED by operator after preflight review. The change has been applied.\n"
                f"{verdict.get('reason','')}"
            )

        # Rejected: the fork is discarded. The parent image was never touched.
        return (
            "BLOCKED by Blast Radius preflight. The change was NOT applied — it ran only in an "
            "isolated fork, which has been discarded.\n\n"
            f"Verdict: {verdict['verdict']}\n"
            f"Reason: {verdict.get('reason','')}\n"
            f"Unexpected effects: {verdict.get('unexpected', [])[:8]}\n"
            f"Omitted effects: {verdict.get('omitted', [])[:8]}\n"
            f"Operator note: {note or '(none)'}\n\n"
            "Narrow your approach so the effect matches your stated intent, then try again."
        )

    # ----------------------------------------------------------------- finish
    def _finish(self) -> None:
        from core.forensics import report as forensic_report
        from core.report import build_report

        store.update_run(self.run_id, status="done", head_image=self.head)
        try:
            build_report(self.session_state)
        except Exception:
            pass

        try:
            text = forensic_report(self.run_id, self.task, self.budget)
            store.update_run(self.run_id, report=text)
        except Exception as exc:  # noqa: BLE001 — a failed report must not fail the run
            store.update_run(self.run_id, report=f"(forensic report unavailable: {exc})")
        store.update_run(self.run_id, budget_json=self.budget.snapshot())


def _cmd_of(call) -> str:
    import json

    try:
        args = json.loads(call.function.arguments or "{}")
    except json.JSONDecodeError:
        return call.function.arguments or ""
    return str(args.get("cmd", ""))


# --------------------------------------------------------------- registry
_RUNS: dict[str, Run] = {}
_LOCK = threading.Lock()


def launch(task: str, seed_cmds: list[str] | None = None, scenario: str | None = None) -> str:
    run = Run(task, seed_cmds, scenario)
    with _LOCK:
        _RUNS[run.run_id] = run
    run.start()
    return run.run_id


def get(run_id: str) -> Run | None:
    with _LOCK:
        return _RUNS.get(run_id)
