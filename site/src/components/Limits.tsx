import { Reveal, Wipe } from "../lib/motion"

const NOTES = [
  ["Not a general drift detector", "Three seeded scenarios, tuned against them. On arbitrary tasks scopes get vaguer and verdicts less certain.", "bg-pink", "-3deg"],
  ["It detects and stops", "No auto-recovery. Recovery is a second product.", "bg-lime", "2deg"],
  ["Filesystem only", "Network commands are gated before they run — discarding a fork can’t undo a network call.", "bg-[#ffe27a]", "-1.5deg"],
  ["The diff is bounded", "Walks are capped so a pathological image can’t stall the gate. Big changesets report as truncated.", "bg-[#bfe3ff]", "2.5deg"],
] as const

export function Limits() {
  return (
    <section className="relative z-10 mx-auto max-w-[1500px] px-5 py-24 sm:px-8">
      <Wipe
        className="display text-[clamp(2.6rem,7vw,6rem)]"
        lines={[<>The fine print,</>, <><span className="serif text-blast">said out loud.</span></>]}
      />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {NOTES.map(([t, b, bg, rot], i) => (
          <Reveal key={t} delay={i * 110} rot={i % 2 ? 4 : -4}>
            <div
              className={`relative h-full min-h-56 border-2 border-ink p-6 shadow-[6px_6px_0_var(--color-ink)] transition-transform duration-500 ease-[var(--ease-spring)] hover:!rotate-0 hover:scale-[1.04] ${bg}`}
              style={{ transform: `rotate(${rot})` }}
            >
              <span aria-hidden className="absolute -top-3 left-6 h-6 w-16 -rotate-6 bg-ink/15" />
              <h3 className="text-2xl font-extrabold leading-tight">{t}</h3>
              <p className="mt-3 text-[15px] leading-snug">{b}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
