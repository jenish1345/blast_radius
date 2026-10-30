import { Wipe, useInView } from "../lib/motion"

function Typed() {
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={`${seen ? "in" : ""} rounded-2xl border-2 border-ink bg-ink p-4 font-mono text-sm text-bone sm:text-base`}>
      <div className="text-bone/50">// intent.json</div>
      <div className="mt-1">
        <span className="text-cobalt">scope</span>: <span className="typing text-lime">"files older than 30 days"</span>
      </div>
    </div>
  )
}

function ForkArt() {
  return (
    <div className="group relative h-40">
      {[0, 1].map((k) => (
        <div
          key={k}
          className={`absolute grid h-28 w-40 grid-cols-6 gap-1 rounded-2xl border-2 p-2 transition-all duration-700 ease-[var(--ease-spring)] ${
            k === 0
              ? "left-0 top-0 border-ink bg-paper"
              : "left-6 top-6 border-dashed border-blast bg-paper/80 group-hover:left-28 group-hover:top-10 group-hover:rotate-6"
          }`}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} className={`rounded-sm ${k === 1 && i % 7 === 2 ? "bg-blast" : "bg-ink/20"}`} />
          ))}
        </div>
      ))}
      <span className="absolute bottom-0 right-0 font-mono text-xs text-ink/60">hover → fork</span>
    </div>
  )
}

function DiffArt() {
  const rows: [string, string][] = [
    ["− 44 files removed", "bg-lime/70"],
    ["− 3 files written today", "bg-blast/80"],
    ["intent: older than 30 days", "bg-cobalt/20"],
  ]
  return (
    <div className="space-y-2 font-mono text-sm">
      {rows.map(([t, c], i) => (
        <div
          key={t}
          className={`rounded-lg border-2 border-ink px-3 py-2 ${c} transition-transform duration-500 ease-[var(--ease-spring)] hover:translate-x-2`}
          style={{ transitionDelay: `${i * 40}ms` }}
        >
          {t}
        </div>
      ))}
      <div className="pt-1 font-sans text-sm font-bold text-blast">≠ DRIFT → operator gate</div>
    </div>
  )
}

const SHEETS = [
  {
    n: "1",
    title: "Say what you mean.",
    body: "Before a risky action runs, Nemotron Nano extracts the agent’s intent — scope, targets, what it believes will change — and writes it down. ~800 tokens, on every action.",
    bg: "bg-pink",
    rot: "-1.4deg",
    art: <Typed />,
  },
  {
    n: "2",
    title: "Run it in a fork.",
    body: "The sandbox image forks in 0.4–2 seconds. The action runs there, never on the parent. Run state is just (messages, image_uuid) — so a fork is a true counterfactual.",
    bg: "bg-lime",
    rot: "1.2deg",
    art: <ForkArt />,
  },
  {
    n: "3",
    title: "Diff it against the plan.",
    body: "The changeset is read without booting a VM and compared to the recorded intent by Nemotron Super. CLEAN runs on the parent. DRIFT stops at an operator gate.",
    bg: "bg-paper",
    rot: "-0.8deg",
    art: <DiffArt />,
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="relative z-10 mx-auto max-w-[1500px] px-5 py-24 sm:px-8">
      <Wipe
        className="display max-w-5xl text-[clamp(3rem,8.5vw,7.5rem)]"
        lines={[
          <>Built around</>,
          <>
            <span className="serif text-cobalt">what it meant,</span>
          </>,
          <>not what it did.</>,
        ]}
      />

      {/* sheets stack as you scroll */}
      <div className="relative mt-16">
        {SHEETS.map((s, i) => (
          <div
            key={s.n}
            className="sticky mb-[16vh] last:mb-0"
            style={{ top: `calc(5.5rem + ${i * 1.1}rem)` }}
          >
            <article
              className={`sheet grid gap-8 p-6 sm:p-10 md:grid-cols-[auto_1.2fr_1fr] md:items-center ${s.bg}`}
              style={{ transform: `rotate(${s.rot})` }}
            >
              <span className="display text-[8rem] leading-[0.75] sm:text-[12rem]">{s.n}</span>
              <div>
                <h3 className="text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h3>
                <p className="mt-4 max-w-xl text-lg leading-snug">{s.body}</p>
              </div>
              <div className="min-w-0">{s.art}</div>
            </article>
          </div>
        ))}
      </div>

      <p className="mt-24 max-w-3xl text-xl leading-snug md:text-2xl">
        The agent loop runs <em className="serif">outside</em> the sandbox — and that is the whole design.
        Forks copy the filesystem image, not memory, services or network, so keeping the loop outside makes
        a fork a real branch of the world and the conversation. Most actions never fork: reads pass
        straight through, only writes and network calls are gated.
      </p>
    </section>
  )
}
