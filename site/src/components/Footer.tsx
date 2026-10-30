import { REPO_URL } from "../links"
import { Magnetic, Roll, Wipe } from "../lib/motion"
import { blast, centerOf, confetti } from "../lib/fx"

export function Cta() {
  return (
    <section className="relative z-10 overflow-hidden border-y-2 border-ink bg-blast py-24 text-center sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Wipe
          className="display text-[clamp(3.4rem,14vw,12rem)]"
          lines={[<>Your agent</>, <>has a plan.</>, <><span className="serif text-bone">Check it.</span></>]}
        />
        <div className="mt-12 flex flex-wrap items-center justify-center gap-5">
          <Magnetic strength={0.5}>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ink !px-9 !py-5 !text-xl"
              onClick={(e) => {
                const p = centerOf(e.currentTarget)
                blast(p.x, p.y, 1.4, "#11110f")
                confetti(p.x, p.y, 60)
              }}
            >
              <Roll>Run it yourself</Roll> <span aria-hidden>↗</span>
            </a>
          </Magnetic>
          <Magnetic>
            <a href={`${REPO_URL}#run-it`} target="_blank" rel="noreferrer" className="btn !px-7 !py-4">
              <Roll>Setup guide</Roll>
            </a>
          </Magnetic>
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  const link = "underline-offset-4 hover:underline"
  return (
    <footer className="relative z-10 mx-auto max-w-[1500px] px-5 py-14 sm:px-8">
      <div className="flex flex-col justify-between gap-10 md:flex-row">
        <div className="max-w-md">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-9 w-9" />
            <span className="text-2xl font-extrabold">Blast Radius</span>
          </div>
          <p className="mt-3 text-lg leading-snug">
            Observability records what happened. Nothing records what the agent <em className="serif">meant</em> to do.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-16 gap-y-2 font-medium">
          <a href={REPO_URL} className={link}>GitHub</a>
          <a href={`${REPO_URL}#models--and-why-each-tier`} className={link}>Models</a>
          <a href={`${REPO_URL}/blob/main/FEEDBACK.md`} className={link}>Feedback</a>
          <a href={`${REPO_URL}#what-this-does-not-do`} className={link}>Limits</a>
          <a href={`${REPO_URL}/blob/main/LICENSE`} className={link}>Apache-2.0</a>
          <a href="https://nebiusglobalaihackathon.devpost.com/" className={link}>Hackathon</a>
        </div>
      </div>
      <p className="mt-12 border-t-2 border-ink pt-5 font-mono text-xs uppercase tracking-wider text-ink/65">
        Track: Best Apps and Agents · Nebius × NVIDIA Global AI Hackathon · NVIDIA Nemotron on Nebius Token Factory
      </p>
    </footer>
  )
}
