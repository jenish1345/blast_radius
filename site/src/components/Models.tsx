import { Drag, Reveal, Wipe } from "../lib/motion"

const MODELS = [
  {
    name: "Nano",
    full: "Nemotron 3 Nano",
    id: "nvidia/nemotron-3-nano-30b",
    job: "Intent extraction",
    why: "Runs on every single tool call, so unit cost dominates. 30B MoE with ~3B active parameters.",
    stat: "~3B active",
    bg: "bg-pink",
    rot: "-2.5deg",
  },
  {
    name: "Super",
    full: "Nemotron 3 Super",
    id: "nvidia/nemotron-3-super-120b-a12b",
    job: "Drift adjudicator",
    why: "Sits in the latency-critical path — a human is waiting to approve. 262K context holds the changeset plus intent history.",
    stat: "262K context",
    bg: "bg-lime",
    rot: "1.5deg",
  },
  {
    name: "Ultra",
    full: "Nemotron 3 Ultra",
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    job: "Agent under test + report",
    why: "1M context holds the entire run trace at once for the end-of-run forensic report.",
    stat: "1M context",
    bg: "bg-cobalt text-bone",
    rot: "-1deg",
  },
]

const FEATURES = [
  ["One client, three tiers", "Token Factory’s OpenAI-compatible API meant zero integration code: one client, three model strings."],
  ["No checkpoint code", "Sandbox image versioning means a fork is just the previous image id."],
  ["A gate on every write", "Reading an image without booting a VM is why the gate can afford to sit in front of every write."],
  ["Live ground truth", "Tavily resolves outside-world claims before the fork is created."],
]

export function Models() {
  return (
    <section id="models" className="relative z-10 mx-auto max-w-[1500px] px-5 py-24 sm:px-8">
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
        <Wipe
          className="display text-[clamp(3rem,9vw,8rem)]"
          lines={[<>Three models.</>, <><span className="serif text-cobalt">Each earns</span> its seat.</>]}
        />
        <Reveal delay={150}>
          <p className="max-w-md text-lg leading-snug">
            All NVIDIA Nemotron, all served on Nebius Token Factory. A twelve-step run with three gated actions
            costs about half a cent.{" "}
            <span className="font-mono text-xs uppercase tracking-widest text-ink/55">(go on — pick one up)</span>
          </p>
        </Reveal>
      </div>

      <div className="mt-14 grid gap-8 md:grid-cols-3">
        {MODELS.map((m, i) => (
          <Reveal key={m.id} delay={i * 120} rot={i % 2 ? 3 : -3} className="min-w-0">
            <Drag>
              <article
                className={`sheet relative flex h-full min-h-[22rem] flex-col p-7 ${m.bg}`}
                style={{ transform: `rotate(${m.rot})` }}
              >
                {/* ticket punch-holes */}
                <span aria-hidden className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-ink bg-bone" />
                <span aria-hidden className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-ink bg-bone" />
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest">
                  <span>{m.job}</span>
                  <span className="rounded-full border-2 border-current px-2.5 py-0.5">{m.stat}</span>
                </div>
                <h3 className="display mt-5 text-7xl sm:text-8xl">{m.name}</h3>
                <p className="mt-1 font-bold">{m.full}</p>
                <p className="mt-1 break-all font-mono text-[11px] opacity-60">{m.id}</p>
                <p className="mt-auto pt-6 text-base leading-snug">{m.why}</p>
              </article>
            </Drag>
          </Reveal>
        ))}
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([t, b], i) => (
          <Reveal key={t} delay={i * 80} rot={i % 2 ? 2 : -2}>
            <div className="h-full rounded-2xl border-2 border-ink bg-paper p-5 transition-transform duration-500 ease-[var(--ease-spring)] hover:-translate-y-1.5 hover:rotate-1">
              <h4 className="text-xl font-extrabold leading-tight">{t}</h4>
              <p className="mt-2 text-sm leading-snug text-ink/70">{b}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
