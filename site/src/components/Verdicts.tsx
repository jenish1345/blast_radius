import { useRef, useState } from "react"
import { Reveal, Wipe } from "../lib/motion"
import { blast, centerOf, confetti, shake } from "../lib/fx"

const CASES = [
  {
    id: "clean",
    verdict: "CLEAN",
    color: "#4c7a00",
    pad: "bg-lime",
    hex: "#cdf25a",
    file: "No. 001",
    task: "Delete stale logs older than 30 days.",
    intent: "find /logs -name '*.log' -mtime +30 -delete",
    result: "44 files removed, all 31–74 days old. Matches intent.",
    outcome: "Runs on the parent. No interruption.",
  },
  {
    id: "drift",
    verdict: "DRIFT",
    color: "#ff4b1f",
    pad: "bg-blast",
    hex: "#ff4b1f",
    file: "No. 002",
    task: "Delete stale logs older than 30 days.",
    intent: "find /logs -name '*.log' -delete",
    result: "47 files removed — 3 were written today. No mtime predicate.",
    outcome: "Stopped at the operator gate, evidence attached.",
  },
  {
    id: "premise",
    verdict: "PREMISE",
    color: "#2f3bff",
    pad: "bg-cobalt text-bone",
    hex: "#2f3bff",
    file: "No. 003",
    task: "Upgrade the deprecated dependency.",
    intent: "Plan rests on a claim about the outside world.",
    result: "Tavily resolves the claim against live sources before the fork exists.",
    outcome: "Plan corrected from ground truth the model could not have.",
  },
] as const

export function Verdicts() {
  const [i, setI] = useState(1)
  const paper = useRef<HTMLDivElement>(null)
  const c = CASES[i]

  const pick = (idx: number, el: HTMLElement) => {
    if (idx === i) return
    setI(idx)
    const p = centerOf(el)
    blast(p.x, p.y, 0.8, CASES[idx].hex)
    shake(paper.current)
    if (CASES[idx].id === "clean") confetti(p.x, p.y, 30)
  }

  return (
    <section id="verdicts" className="relative z-10 mx-auto max-w-[1500px] px-5 py-24 sm:px-8">
      <Wipe
        className="display text-[clamp(3rem,9vw,8rem)]"
        lines={[<>Same task.</>, <><span className="serif text-blast">Different</span> verdict.</>]}
      />

      <div className="mt-12 grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="flex gap-4 md:flex-col">
          {CASES.map((x, idx) => (
            <Reveal key={x.id} delay={idx * 90} rot={idx % 2 ? 2 : -2} className="flex-1">
              <button
                onClick={(e) => pick(idx, e.currentTarget)}
                aria-pressed={idx === i}
                className={`btn w-full justify-between !rounded-2xl !py-5 text-lg sm:text-2xl ${x.pad} ${
                  idx === i ? "!translate-x-1 !translate-y-1 !shadow-none" : ""
                }`}
              >
                <span className="display !leading-none">{x.verdict}</span>
                <span className="hidden font-mono text-xs opacity-70 sm:inline">{x.file}</span>
              </button>
            </Reveal>
          ))}
          <p className="hidden font-mono text-xs uppercase tracking-widest text-ink/55 md:block">
            ↑ stamp a case. it slams.
          </p>
        </div>

        <div ref={paper} className="relative">
          {/* tape */}
          <span aria-hidden className="absolute -top-3 left-1/2 z-10 h-7 w-28 -translate-x-1/2 -rotate-3 bg-pink/80 shadow-sm" />
          <div className="sheet relative min-h-[26rem] overflow-hidden p-7 sm:p-10" style={{ transform: "rotate(0.8deg)" }}>
            <div key={c.id} className="reveal in" style={{ ["--rot" as string]: "0deg" }}>
              <p className="font-mono text-xs uppercase tracking-widest text-ink/55">Case file {c.file}</p>
              <p className="display mt-3 pr-4 text-3xl !leading-[0.95] sm:text-5xl">“{c.task}”</p>
              <dl className="mt-7 space-y-5">
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-widest text-ink/55">command / intent</dt>
                  <dd className="mt-1.5 overflow-x-auto rounded-xl border-2 border-ink bg-ink px-4 py-2.5 font-mono text-[13px] text-bone">
                    {c.intent}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-widest text-ink/55">what the fork showed</dt>
                  <dd className="mt-1.5 text-lg leading-snug">{c.result}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-widest text-ink/55">outcome</dt>
                  <dd className="mt-1.5 text-lg font-bold leading-snug">{c.outcome}</dd>
                </div>
              </dl>
            </div>
            <span key={`s-${c.id}`} className="stamp bottom-6 right-4 sm:right-10" style={{ color: c.color }}>
              {c.verdict}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
