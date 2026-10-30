import { useEffect, useMemo, useRef, useState } from "react"
import { Reveal, Wipe } from "../lib/motion"
import { blast, centerOf, confetti, shake } from "../lib/fx"

type Phase = "idle" | "naive" | "naiveDone" | "forking" | "drift" | "fixing" | "clean" | "applied"
type TileState = "idle" | "gone" | "flag" | "safe"

const COLS = 8
const COUNT = 47
const FRESH = new Set([9, 23, 38]) // the three files written today

// stable pseudo-random so each tile always flies the same way
const rnd = (n: number) => {
  const x = Math.sin(n * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

const NAIVE = "find /logs -name '*.log' -delete"

const NARRATION: Record<Phase, { title: string; body: string }> = {
  idle: {
    title: "An agent was told: “delete stale logs older than 30 days.”",
    body: "It wrote a command. Nothing looks wrong. Let it run.",
  },
  naive: { title: "Running…", body: "Every file in /logs is being deleted." },
  naiveDone: {
    title: "exit 0. Cost normal. Zero errors.",
    body: "Your dashboard is green. But 47 files are gone — you asked for 44.",
  },
  forking: {
    title: "Rewound. Now Blast Radius is in front.",
    body: "It forked the image and is running the same command in the fork only. The parent is untouched.",
  },
  drift: {
    title: "Held. The diff doesn’t match the intent.",
    body: "Intent: files older than 30 days. Actual: 3 files written today were deleted too. Nothing real was harmed.",
  },
  fixing: {
    title: "Rejected with a reason. The agent retries.",
    body: "It adds a modified-time filter and runs it in a fresh fork.",
  },
  clean: {
    title: "The diff matches the intent.",
    body: "44 removed, 3 kept. Now — and only now — it can touch the real thing.",
  },
  applied: {
    title: "44 gone. 3 kept. Zero surprises.",
    body: "That’s the whole product: check what the agent meant before it acts.",
  },
}

function Grid({
  label,
  sub,
  states,
  ghost = false,
}: {
  label: string
  sub: string
  states: TileState[]
  ghost?: boolean
}) {
  const tiles = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const cx = col - (COLS - 1) / 2
        const cy = row - 2.5
        const dist = Math.hypot(cx, cy)
        const ang = Math.atan2(cy, cx) + (rnd(i) - 0.5) * 0.9
        const power = 120 + rnd(i + 7) * 260
        return {
          dx: `${Math.cos(ang) * power}px`,
          dy: `${Math.sin(ang) * power - 60}px`,
          r: `${(rnd(i + 3) - 0.5) * 540}deg`,
          d: `${dist * 55}ms`,
        }
      }),
    [],
  )
  const left = states.filter((s) => s !== "gone").length
  return (
    <div className={`sheet min-w-0 p-4 sm:p-5 ${ghost ? "!border-dashed !bg-paper/60" : ""}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-extrabold sm:text-xl">{label}</h3>
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink/60">{sub}</span>
      </div>
      <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
        {tiles.map((t, i) => (
          <div
            key={i}
            title={FRESH.has(i) ? "written today" : "31–74 days old"}
            className={`tile ${FRESH.has(i) ? "fresh" : ""} ${states[i] === "gone" ? "gone" : ""} ${
              states[i] === "flag" ? "flag" : ""
            } ${states[i] === "safe" ? "safe" : ""}`}
            style={{ ["--dx" as string]: t.dx, ["--dy" as string]: t.dy, ["--r" as string]: t.r, ["--d" as string]: t.d }}
          />
        ))}
      </div>
      <p className="mt-3 font-mono text-xs">
        <span className="font-bold tabular-nums">{left}</span> / {COUNT} files
      </p>
    </div>
  )
}

export function Playground() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [parent, setParent] = useState<TileState[]>(() => Array(COUNT).fill("idle"))
  const [fork, setFork] = useState<TileState[]>(() => Array(COUNT).fill("idle"))
  const [forkOn, setForkOn] = useState(false)
  const [stamp, setStamp] = useState<null | "DRIFT" | "CLEAN">(null)
  const [fixed, setFixed] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const forkRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])

  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const all = (s: TileState): TileState[] => Array(COUNT).fill(s)
  const oldGone = (): TileState[] =>
    Array.from({ length: COUNT }, (_, i) => (FRESH.has(i) ? "safe" : "gone")) as TileState[]

  const boom = (power: number, color: string, from?: Element | null) => {
    const p = from ? centerOf(from) : centerOf(stage.current!)
    blast(p.x, p.y, power, color)
  }

  const runNaive = () => {
    setPhase("naive")
    boom(1.2, "#ff4b1f", stage.current?.querySelector("[data-parent]"))
    setParent(all("gone"))
    after(1900, () => setPhase("naiveDone"))
  }

  const rewind = () => {
    setPhase("forking")
    setParent(all("idle"))
    setFixed(false)
    after(900, () => {
      setForkOn(true)
      boom(0.7, "#2f3bff", forkRef.current)
    })
    after(1500, () => setFork(all("gone")))
    after(3300, () => {
      // evidence: the fresh files reappear flagged
      setFork(Array.from({ length: COUNT }, (_, i) => (FRESH.has(i) ? "flag" : "gone")) as TileState[])
      setStamp("DRIFT")
      shake(stage.current)
      boom(1.4, "#ff4b1f", forkRef.current)
      setPhase("drift")
    })
  }

  const reject = () => {
    setPhase("fixing")
    setStamp(null)
    setFork(all("idle"))
    setFixed(true)
    after(1000, () => setFork(oldGone()))
    after(2900, () => {
      setStamp("CLEAN")
      setPhase("clean")
      const p = forkRef.current ? centerOf(forkRef.current) : { x: innerWidth / 2, y: innerHeight / 2 }
      blast(p.x, p.y, 1.4, "#cdf25a")
      confetti(p.x, p.y, 44)
    })
  }

  const apply = () => {
    setParent(oldGone())
    boom(1.2, "#cdf25a", stage.current?.querySelector("[data-parent]"))
    setPhase("applied")
  }

  const reset = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setPhase("idle")
    setParent(all("idle"))
    setFork(all("idle"))
    setForkOn(false)
    setStamp(null)
    setFixed(false)
  }

  const n = NARRATION[phase]
  const busy = phase === "naive" || phase === "forking" || phase === "fixing"
  const command = fixed ? (
    <>
      find /logs -name '*.log' <mark className="bg-lime px-1">-mtime +30</mark> -delete
    </>
  ) : (
    NAIVE
  )

  return (
    <section id="playground" className="relative z-10 mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
      <div className="mb-10 grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
        <Wipe
          className="display text-[clamp(3rem,9vw,8rem)]"
          lines={[
            <>Play with</>,
            <>
              the <span className="serif text-blast">failure.</span>
            </>,
          ]}
        />
        <Reveal delay={200}>
          <p className="max-w-md text-lg leading-snug">
            47 log files. <span className="bg-lime px-1">Three</span> were written today. Press the button
            and watch what a green dashboard hides — then watch it get caught.
          </p>
        </Reveal>
      </div>

      <Reveal>
        <div ref={stage} className="rounded-[2.2rem] border-2 border-ink bg-bone/70 p-3 sm:p-6">
          {/* the command bar */}
          <div className="mb-4 flex flex-col gap-2 rounded-2xl border-2 border-ink bg-ink p-4 font-mono text-[13px] text-bone sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="text-cobalt">intent</span> <span className="text-bone/50">›</span> delete stale logs older than 30 days
            </span>
            <span className="min-w-0 break-all">
              <span className="text-blast">$</span> {command}
            </span>
          </div>

          <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2">
            <div data-parent className="min-w-0">
              <Grid label="Parent image" sub="the real thing" states={parent} />
            </div>

            <div ref={forkRef} className="relative min-w-0">
              {forkOn ? (
                <div className="reveal in origin-top-left" style={{ ["--rot" as string]: "-4deg" }}>
                  <div style={{ transform: "rotate(1.2deg)" }}>
                    <Grid label="Fork" sub="ephemeral · 0.8s" states={fork} ghost />
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-40 items-center justify-center rounded-[2rem] border-2 border-dashed border-ink/40 p-6 text-center font-mono text-xs uppercase tracking-widest text-ink/45">
                  no fork yet
                </div>
              )}
              {stamp && (
                <span
                  key={stamp}
                  className={`stamp left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                    stamp === "DRIFT" ? "text-blast" : "text-[#4c7a00]"
                  }`}
                >
                  {stamp}
                </span>
              )}
            </div>
          </div>

          {/* narrator + controls */}
          <div className="mt-5 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <div key={phase} className="reveal in">
              <h3 className="text-2xl font-extrabold leading-tight sm:text-3xl">{n.title}</h3>
              <p className="mt-2 max-w-2xl text-base text-ink/75 sm:text-lg">{n.body}</p>
              {phase === "naiveDone" && (
                <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs font-bold">
                  {["exit 0 ✓", "cost: normal ✓", "errors: 0 ✓", "47 files gone ✗"].map((t, i) => (
                    <span key={t} className={`rounded-full border-2 border-ink px-3 py-1 ${i < 3 ? "bg-lime" : "bg-blast"}`}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {phase === "idle" && (
                <button className="btn btn-blast" onClick={runNaive}>
                  Let the agent run it ▸
                </button>
              )}
              {phase === "naiveDone" && (
                <button className="btn btn-lime" onClick={rewind}>
                  Rewind — put Blast Radius in front
                </button>
              )}
              {phase === "drift" && (
                <button className="btn btn-blast" onClick={reject}>
                  Reject — tell the agent why
                </button>
              )}
              {phase === "clean" && (
                <button className="btn btn-lime" onClick={apply}>
                  Apply to the real thing ▸
                </button>
              )}
              {phase === "applied" && (
                <button className="btn" onClick={reset}>
                  Play again ↺
                </button>
              )}
              {busy && <span className="font-mono text-sm">working…</span>}
              {phase !== "idle" && phase !== "applied" && !busy && (
                <button className="text-sm font-medium underline underline-offset-4" onClick={reset}>
                  start over
                </button>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={100}>
        <p className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-ink/65">
          <span className="flex items-center gap-2"><i className="inline-block h-3.5 w-3.5 rounded border-[1.5px] border-ink bg-lime" /> written today</span>
          <span className="flex items-center gap-2"><i className="inline-block h-3.5 w-3.5 rounded border-[1.5px] border-ink bg-[#e0d9c6]" /> 31–74 days old</span>
          <span className="flex items-center gap-2"><i className="inline-block h-3.5 w-3.5 rounded border-2 border-dashed border-blast" /> flagged in the diff</span>
          <span>· a replay of the seeded drift scenario</span>
        </p>
      </Reveal>
    </section>
  )
}
