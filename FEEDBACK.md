# Feedback on Nebius Token Factory, Sandboxes, and NVIDIA Nemotron

> **Before you submit this: replace every `<<MEASURED>>` marker with what you actually observed.**
> The Most Valuable Feedback prize is judged on "completeness, viability, and potential impact"
> of the feedback. Invented numbers are worse than no numbers — this is read by the DevRel team
> who built the thing, and they will know. Everything below is a real finding from building
> Blast Radius; only the measurements need filling in.

Built: Blast Radius, a preflight verification gate for autonomous agents. Nemotron 3 Nano, Super
and Ultra on Token Factory; Sandboxes (ConTree) for forked execution; Nebius AI Cloud for hosting.

---

## 1. Sandboxes: the fork-semantics gap is documented but its consequence is not

The docs state plainly that "process memory, running services, and network state are not
preserved" across a fork. That sentence is correct and easy to miss the implication of.

The implication is architectural and worth a paragraph of its own in the docs: **an agent whose
loop runs inside a sandbox cannot be forked.** Everything stateful has to live outside, and the
sandbox has to be treated as *the world*, not as the process. Once we moved the agent loop into
the orchestrator, run state became `(message_history, image_uuid)` — both trivially copyable — and
a fork became a genuine counterfactual rather than a container snapshot.

**Suggested addition** to `sandboxes/overview`, under the branching section:

> **Designing agent workloads around forking.** Because process memory is not preserved, keep your
> agent loop and its conversation state in your own process and treat the sandbox as the
> environment it acts on. Branch state is then the pair (your conversation history, the image id),
> which you can copy freely. Running the agent itself inside the sandbox prevents branching.

This single paragraph would have saved us roughly half a day, and we suspect it is the most common
way a first-time user misreads the product.

## 2. There is no hosting path in Token Factory, and the docs do not say so anywhere

Dedicated endpoints deploy model weights. Sandboxes expose no inbound ports and no preview URLs.
Neither page says "you cannot host an application here", so the absence has to be inferred from
two separate docs plus a failed experiment.

This matters more than it sounds, because there is **publicly circulating advice telling hackathon
participants to "deploy your dashboard as a Nebius Serverless Endpoint."** We saw it before we
read the docs. Anyone following it loses hours at exactly the wrong moment.

**Suggested fix:** one line on the Sandboxes overview — "Sandboxes execute code; they do not serve
it. To host an application, use Nebius AI Cloud (Managed Kubernetes or Compute)." — and the
equivalent on the dedicated-endpoints page. A short "where does my app run?" page linking Token
Factory to AI Cloud would close the gap entirely.

Comparable products advertise port exposure and preview URLs. If that is on the Sandboxes roadmap,
saying so on the overview would help people plan; if it is deliberately out of scope, saying *that*
is equally useful.

## 3. Rate limits are dynamic and invisible, so you cannot design fan-out

The documented model is a base cap that scales when you sustain ~80% utilisation, with 429s over
the line. There is no published starting value and no remaining-quota signal on the response.

The practical consequence: you cannot choose a concurrency number analytically. We settled on a
fan-out of ≤ 8 by trial and error. On a cold account we started seeing 429s at
`<<MEASURED: concurrency where you first saw 429>>` concurrent requests against
`<<MEASURED: which model>>`, recovering after `<<MEASURED: backoff that worked>>`.

**Concrete ask:** return `x-ratelimit-remaining` and `x-ratelimit-reset` headers, or expose current
headroom on a `/v1/limits` endpoint. Either turns a guessing game into a scheduling decision.
Secondarily: state the cold-account starting cap in the docs, even approximately.

## 4. The 50-concurrent-operation beta ceiling changed our design

We originally intended to fork at every decision point and explore several branches in parallel.
The 50-op ceiling plus the rate-limit opacity above pushed us to fork only on write, delete and
network actions, classified deterministically.

That turned out to be a **better** design — most actions are reads, so gating them all would make
the product unusable — but we arrived at it through a limit rather than through judgement. Worth
noting in the docs that the ceiling tends to push users toward selective branching, because that is
the pattern you probably want people to land on anyway.

## 5. Nemotron tier characteristics matched their published descriptions closely

This is the part that worked, and it is worth saying because it is unusual.

- **Nano 30B** for per-action intent extraction: runs on every tool call, so unit cost dominated
  the choice. Observed `<<MEASURED: p50 latency>>` and `<<MEASURED: avg tokens>>` per extraction.
  The "tuned for software debugging and summarisation" description was accurate for this job.
- **Super 120B** as the drift adjudicator in the latency-critical path: `<<MEASURED: p50 latency>>`.
  Structured-JSON adherence was `<<MEASURED: how often it returned valid JSON first try>>`.
- **Ultra 550B** for the end-of-run forensic report over the full trace: the 1M context genuinely
  earned its place here and nowhere else in our system.

**One request:** publish per-model guidance on structured output — specifically whether
`response_format: {"type": "json_object"}` is supported per model. We wrote a fallback path
(fenced-JSON extraction, then a brace scan) because we could not determine support without trying
it. A support matrix in the model catalogue would remove that code entirely.

## 6. Smaller things

- **Model IDs are not discoverable from the docs pages we landed on.** `GET /v1/models` works and is
  the reliable source; a copyable ID on each model's catalogue page would save a step.
- **`contree-sdk` API surface is thin on reference docs.** We wrote a probe script
  (`probe_sdk.py` in our repo) purely to print method signatures. An autogenerated API reference
  would make that unnecessary.
- **The $25 + $25 credit path worked cleanly.** Our entire build, including
  `<<MEASURED: number of full runs>>` full runs and all testing, cost `<<MEASURED: total $>>`.
  Credits were not a constraint; the only real spend risk was an unbounded retry loop against a
  1M-context model, which we solved with a client-side ceiling.

---

**Summary of the three changes with the highest impact:** (1) a paragraph in the Sandboxes docs on
designing agent loops around fork semantics, (2) an explicit statement that Token Factory does not
host applications, with a pointer to AI Cloud, (3) rate-limit headroom exposed on the response.
