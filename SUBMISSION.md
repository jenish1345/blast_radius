# Devpost submission checklist — Blast Radius

Deadline: **Oct 30, 2026, 10:00 am PT** (≈ 22:30 IST). Track: **Best Apps and Agents**.

## Required by the Official Rules

| Requirement | Status |
|---|---|
| Runs on Nebius Token Factory (runtime inference call) | Backend calls Nemotron via Token Factory — confirm `make smoke` passes on your key |
| Uses an NVIDIA open source model | Nemotron 3 Nano / Super / Ultra |
| Public repo (GitHub/GitLab/Bitbucket) | `github.com/jenish1345/blast_radius` — **make it public** |
| Open-source licence visible in the repo's About section | Add `LICENSE` (Apache-2.0, included here) and push it; GitHub will detect it |
| README with setup + run instructions | Exists; add the section below |
| README highlights Nemotron use, where Token Factory helped, other Nebius services | Exists (Models table, "Where Token Factory accelerated the work") |
| Working demo URL | **TODO** — deploy (see DEPLOY.md) and paste the URL |
| Demo video, < 3 min, public on YouTube, no copyrighted music | **TODO** |
| Text description (features + functionality) | Reuse the README intro |
| Track chosen | Best Apps and Agents |
| Feedback on Nebius Token Factory / AI Cloud / NVIDIA tools | `FEEDBACK.md` — paste into the Devpost feedback field too (qualifies for Most Valuable Feedback) |
| If the project pre-dates the Submission Period (Aug 26, 2026): written explanation of what was significantly updated | **Add to README — template below** |
| Tavily bonus ($3,000) — functional runtime call to Tavily | `core/premise.py` — mention it in the description |

Note: a project is eligible for one Overall/Track award **and** one Bonus award.

## README section to add

```md
## What changed during the Submission Period

This project existed before Aug 26, 2026. During the Submission Period we:

- <replace: e.g. built the fork-and-diff gate on Nebius Sandboxes>
- <replace: e.g. added intent extraction (Nemotron Nano) and drift adjudication (Nemotron Super)>
- <replace: e.g. added Tavily premise checking>
- Rebuilt the web UI (React + Vite + Tailwind): interactive drift demo, verdict explorer, model rationale.
```

Edit the bullets so they are true — judges verify this against the git history.

## Demo video outline (≤ 3:00)

1. 0:00 — The failure: "delete stale logs older than 30 days" → green dashboard.
2. 0:25 — Run the drift scenario live; show intent, fork, diff, DRIFT verdict.
3. 1:15 — Show Nano / Super / Ultra in the logs hitting Token Factory.
4. 1:50 — Tavily premise check resolving a claim before the fork.
5. 2:20 — Operator gate: reject with a reason; agent recovers.
6. 2:45 — Limits slide, repo + licence, close.
