import { useState } from "react"
import { Reveal, Wipe } from "../lib/motion"
import { blast, centerOf } from "../lib/fx"

const ITEMS = [
  ["Why not just check the exit code and cost?", "Because they’re green when the agent does the wrong thing correctly. The mutation happened — only comparing it to the stated intent shows it was the wrong one."],
  ["Does every action get forked?", "No. A deterministic classifier lets reads run straight through and gates only writes and network calls, so it doesn’t interrupt on everything."],
  ["Why does the agent loop run outside the sandbox?", "Forks copy the filesystem image only. Keeping the loop outside makes run state a copyable pair, (messages, image_uuid), so a fork is a real counterfactual."],
  ["What do the Nemotron models do?", "Nano extracts intent on every action, Super adjudicates the diff, and Ultra runs the agent under test and writes the forensic report — all via Nebius Token Factory."],
  ["What does Tavily do?", "When a plan rests on a claim about the outside world — a deprecation, an advisory, a version — it resolves that claim against live sources before the fork is created."],
  ["Is it open source?", "Yes. Apache-2.0. The repository includes the gate, the seeded scenarios and setup instructions."],
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="relative z-10 mx-auto max-w-5xl px-5 py-24 sm:px-8">
      <Wipe
        className="display text-center text-[clamp(3.2rem,10vw,8.5rem)]"
        lines={[<>Good <span className="serif text-cobalt">questions.</span></>]}
      />
      <Reveal delay={120}>
        <div className="mt-14 border-t-2 border-ink">
          {ITEMS.map(([q, a], i) => {
            const isOpen = open === i
            return (
              <div key={q} className="border-b-2 border-ink">
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-${i}`}
                    onClick={(e) => {
                      setOpen(isOpen ? null : i)
                      if (!isOpen) {
                        const p = centerOf(e.currentTarget.querySelector("[data-plus]")!)
                        blast(p.x, p.y, 0.5, "#2f3bff")
                      }
                    }}
                    className="group flex w-full items-center gap-5 py-6 text-left"
                  >
                    <span className="font-mono text-sm text-ink/50">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1 text-2xl font-extrabold leading-tight transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-x-2 sm:text-4xl">
                      {q}
                    </span>
                    <span
                      data-plus
                      aria-hidden
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-ink text-3xl leading-none transition-all duration-500 ease-[var(--ease-spring)] ${
                        isOpen ? "rotate-[135deg] bg-blast" : "bg-paper group-hover:rotate-90 group-hover:bg-lime"
                      }`}
                    >
                      +
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-${i}`}
                  role="region"
                  className={`grid transition-all duration-700 ease-[var(--ease-out-expo)] ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-3xl pb-7 pl-12 text-lg leading-snug text-ink/75 sm:pl-16">{a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Reveal>
    </section>
  )
}
