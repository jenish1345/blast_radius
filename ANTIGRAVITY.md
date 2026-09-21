# Building this in Antigravity — the prompt sequence

Feed these in order. Each one is scoped so the agent finishes it and you can verify it before
moving on. Do not paste them all at once; the value of the sequence is the verification between
steps.

The repo you have is complete and real. Antigravity's job is to **make it run against the live
APIs**, fix the one uncertain integration, and then extend it. It is not to rewrite it.

---

## Task 1 — Reconcile the ConTree adapter (do this before anything else)

> Read `probe_sdk.py`, run it, and read `core/sandbox.py`.
>
> `core/sandbox.py` is an adapter over the Nebius Token Factory Sandboxes SDK (ConTree). It has a
> block marked ADAPTER SURFACE with four methods: `create_root`, `exec`, `list_files`, `read_file`.
> Those methods were written from documentation, not from a live SDK, so the method names may not
> match the installed package.
>
> Run `python probe_sdk.py`, read its output, and correct `core/sandbox.py` so all four methods
> work against the real SDK. Preserve these semantics exactly:
> - `exec()` must be pure with respect to its input image: it returns a NEW image id and never
>   mutates the parent. This is the property the whole project depends on.
> - `list_files()` and `read_file()` should avoid booting a VM if the SDK allows it.
>
> Then run `python scripts/smoke.py` and iterate until it prints PASS. Do not modify any file
> other than `core/sandbox.py` and, if strictly necessary, `requirements.txt`. Do not stub, mock,
> or fake any sandbox behaviour — if something cannot be made to work, say so explicitly rather
> than simulating it.

**Verify yourself:** `make smoke` prints PASS and shows removed files. If it does not, do not
proceed — the whole design rests on this.

---

## Task 2 — Confirm the model IDs

> Run `make models`. Compare the output against `BR_MODEL_AGENT`, `BR_MODEL_INTENT` and
> `BR_MODEL_JUDGE` in `.env`. If any of the three IDs is not in the list, pick the closest
> available NVIDIA Nemotron model for that role and update `.env` and the model routing table in
> `README.md` to match. Also update the `PRICES` dict in `core/llm.py` with the real prices from
> the Token Factory catalogue.
>
> The hackathon requires at least one NVIDIA open model, so at minimum the intent extractor and
> adjudicator must be Nemotron.

---

## Task 3 — First live run

> Start the server with `make run` and open http://localhost:8000. Run the `clean` scenario.
>
> Watch for and fix: JSON parsing failures from `chat_json`, tool-call argument shapes the loop
> does not handle, and any place where the agent's `shell` tool call is malformed. Fix these in
> `core/llm.py` and `core/loop.py`.
>
> Report back: did the run complete, what verdict did each gated step get, and what did it cost
> (the cost is shown in the header)?

**Verify yourself:** the timeline fills in, read-only steps show as `safe`, and the run finishes
with a forensic report.

---

## Task 4 — The headline scenario

> Run the `drift` scenario. The expected outcome is that the agent deletes more than it said it
> would, and the adjudicator returns DRIFT.
>
> If the verdict is CLEAN because the agent actually got it right, do NOT change the scenario to
> force a failure and do NOT script the drift. Instead, report what the agent did. Then try
> raising the agent model's temperature to 0.3 and re-running a few times to see whether the
> failure occurs naturally. Record whichever real runs you get.
>
> If the verdict is DRIFT, check that the `unexpected` array in the verdict actually names the
> files written today, and that they are highlighted in the diff pane of the UI.

**Verify yourself:** this is your video's money shot. The left pane shows every check green; the
right pane shows the file list with today's files highlighted.

---

## Task 5 — Tavily premise check

> Run the `premise` scenario with `TAVILY_API_KEY` set. Read `scenarios/premise.json` — its notes
> explain that the premise must actually be false at the time of recording.
>
> Check the `external premises` panel in the UI. If it shows "unresolved", the premise is too
> vague for the search to settle; propose three sharper replacement premises — confident,
> checkable, currently-false claims about widely documented packages — and test each until one
> comes back CONTRADICTED. Update `scenarios/premise.json` with the one that works.
>
> Do not fabricate a search result or hardcode the outcome under any circumstances. If no premise
> can be made to resolve as contradicted, say so and we will cut this feature.

---

## Task 6 — Record the traces

> Run `python scripts/record.py --all`. Confirm each recorded run appears in the "Recorded runs"
> dropdown in the UI and renders correctly when selected, including after restarting the server.
>
> These recordings are the demo's insurance against rate limits on judging day. They are real runs
> in the same tables as live ones. Make sure the UI clearly labels a recorded run as a recording —
> add a visible badge if it does not already read unambiguously.

---

## Task 7 — Harden the operator console

> The UI is `ui/index.html`, vanilla JS, no build step — keep it that way.
>
> Improve, in this order:
> 1. A visible badge distinguishing a live run from a recorded one.
> 2. The diff pane: group by directory when there are more than 30 changed paths, and keep the
>    `unexpected` files pinned to the top and highlighted.
> 3. A step detail view: clicking a timeline entry shows that step's full intent, changeset and
>    verdict, not just the latest one.
> 4. Empty and error states that say what to do, not just what went wrong.
>
> Do not add a build step, a framework, or a CDN dependency. Do not add a login.

**Why this task gets the most time:** Design is 25% of the judging score and it is this project's
weakest criterion. "A complete, coherent product experience, not just a technical proof of
concept" is the literal wording.

---

## Task 8 — Deploy

> Follow `DEPLOY.md`, Option A. Deploy to a Nebius AI Cloud CPU VM with systemd and nginx, record
> the traces on the VM, then run the pre-submission verification checklist at the bottom of that
> file and report which items pass.

---

## Task 9 — Capture the hero GIF

> Record a screen capture of the drift scenario at the moment the gate appears: the left pane
> showing all checks green, the right pane showing the diff with today's files highlighted.
> Save it as `docs/hero.gif`, keep it under 5 MB, and replace the placeholder comment at the top
> of `README.md` with it.

---

## Task 10 — Final pass

> 1. Add an Apache-2.0 `LICENSE` file at the repo root (fetch the canonical text from
>    https://www.apache.org/licenses/LICENSE-2.0.txt).
> 2. Fill in every `<<MEASURED>>` marker in `FEEDBACK.md` with numbers actually observed during
>    the build. If a number was never measured, delete that sentence rather than inventing one.
> 3. Update the model routing table in `README.md` so it matches `.env` exactly.
> 4. Put the live demo URL at the top and bottom of `README.md`.
> 5. Run `make clean && make smoke` on a fresh clone with only `.env` filled in, and fix anything
>    that breaks.

---

## Rules to give Antigravity up front

Paste this once at the start of the session:

> Working rules for this repo:
> - Never mock, stub, or simulate an API response. If something cannot be made to work against the
>   live API, stop and tell me — do not fake it. A demo that works because it is faked is worthless
>   to me and disqualifying if noticed.
> - Never fabricate a measurement, a benchmark number, a search result, or a quote.
> - The agent loop must stay outside the sandbox. Do not "simplify" by moving it inside.
> - `core/risk.py` stays deterministic. Do not replace it with a model call.
> - The token and cost ceilings in `core/llm.py` stay. Do not raise them to make something pass.
> - Prefer fixing one file over rewriting several. Tell me which file you changed and why.
