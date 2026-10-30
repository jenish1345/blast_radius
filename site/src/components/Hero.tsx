import { useEffect, useRef } from "react"
import { REPO_URL } from "../links"
import { CountUp, Magnetic, Reveal, Roll } from "../lib/motion"
import { reducedMotion, type BlastDetail } from "../lib/fx"

type Word = { w: string; cls?: string }
const LINES: Word[][] = [
  [{ w: "Don’t" }, { w: "trust" }],
  [{ w: "exit", cls: "serif text-cobalt" }, { w: "0.", cls: "serif text-cobalt" }],
  [{ w: "Check" }, { w: "what" }, { w: "it" }],
  [{ w: "meant.", cls: "serif text-blast" }],
]

type P = { x: number; y: number; vx: number; vy: number; r: number; cx: number; cy: number; hot: boolean }

/**
 * Every letter is a little physical object: the cursor shoves them,
 * a click blows them across the screen, springs bring them home.
 */
function PhysicsHeadline() {
  const root = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const h1 = root.current!
    if (reducedMotion()) return
    const els = [...h1.querySelectorAll<HTMLElement>("[data-c]")]
    const S: P[] = els.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, cx: 0, cy: 0, hot: false }))
    const ptr = { x: -9999, y: -9999 }
    let visible = true
    let raf = 0

    const measure = () => {
      els.forEach((el) => (el.style.transform = "none"))
      els.forEach((el, i) => {
        const b = el.getBoundingClientRect()
        S[i].cx = b.left + b.width / 2 + window.scrollX
        S[i].cy = b.top + b.height / 2 + window.scrollY
      })
    }

    const onMove = (e: PointerEvent) => {
      ptr.x = e.clientX + window.scrollX
      ptr.y = e.clientY + window.scrollY
    }
    const onBlast = (e: Event) => {
      const { x, y, power } = (e as CustomEvent<BlastDetail>).detail
      const bx = x + window.scrollX
      const by = y + window.scrollY
      S.forEach((s) => {
        const dx = s.cx - bx
        const dy = s.cy - by
        const d = Math.hypot(dx, dy) || 1
        if (d > 900) return
        const f = (1 - d / 900) * power * 46
        s.vx += (dx / d) * f + (Math.random() - 0.5) * 6
        s.vy += (dy / d) * f - 8 - Math.random() * 6
      })
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible) return
      for (let i = 0; i < S.length; i++) {
        const s = S[i]
        const dx = s.cx - ptr.x
        const dy = s.cy - ptr.y
        const d = Math.hypot(dx, dy)
        if (d < 190 && d > 0.1) {
          const f = Math.pow(1 - d / 190, 2) * 3.4
          s.vx += (dx / d) * f
          s.vy += (dy / d) * f
        }
        s.vx += -s.x * 0.055
        s.vy += -s.y * 0.055
        s.vx *= 0.87
        s.vy *= 0.87
        s.x += s.vx
        s.y += s.vy
        s.r += (s.vx * 2.4 - s.r) * 0.18
        const speed = Math.hypot(s.vx, s.vy)
        const moving = speed > 0.04 || Math.abs(s.x) > 0.1 || Math.abs(s.y) > 0.1
        const el = els[i]
        if (moving) {
          el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) rotate(${s.r}deg) scale(${1 + Math.min(speed * 0.02, 0.3)})`
          const hot = speed > 2.2
          if (hot !== s.hot) {
            s.hot = hot
            el.style.color = hot ? "var(--color-blast)" : ""
          }
        } else if (el.style.transform) {
          el.style.transform = ""
          el.style.color = ""
          s.hot = false
        }
      }
    }

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 })
    io.observe(h1)
    measure()
    document.fonts?.ready.then(measure)
    window.addEventListener("resize", measure)
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("blast", onBlast)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener("resize", measure)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("blast", onBlast)
    }
  }, [])

  const label = LINES.map((l) => l.map((w) => w.w).join(" ")).join(" ")
  return (
    <h1
      ref={root}
      aria-label={label}
      className="display text-[clamp(3.6rem,15.5vw,13.5rem)] leading-[0.84]"
    >
      {LINES.map((line, li) => (
        <span key={li} className="block" aria-hidden>
          {line.map((word, wi) => (
            <span key={wi} className={`mr-[0.2em] inline-block whitespace-nowrap ${word.cls ?? ""}`}>
              {[...word.w].map((ch, ci) => (
                <span key={ci} data-c className="inline-block will-change-transform">
                  {ch}
                </span>
              ))}
            </span>
          ))}
        </span>
      ))}
    </h1>
  )
}

function Badge() {
  const text = "NEMOTRON ✺ TOKEN FACTORY ✺ OPEN SOURCE ✺ "
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-2 top-2 hidden h-40 w-40 sm:block md:right-8 md:top-6 md:h-52 md:w-52"
      style={{ animation: "bob 5s ease-in-out infinite" }}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" style={{ animation: "spin 22s linear infinite" }}>
        <defs>
          <path id="circ" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle cx="100" cy="100" r="96" fill="#cdf25a" stroke="#11110f" strokeWidth="3" />
        <text fontFamily="JetBrains Mono, monospace" fontSize="15.5" fontWeight="700" letterSpacing="2.2" fill="#11110f">
          <textPath href="#circ">{text.repeat(1)}</textPath>
        </text>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-serif text-6xl italic">✺</div>
    </div>
  )
}

export function Hero() {
  return (
    <section id="top" className="relative z-10 mx-auto max-w-[1500px] px-5 pb-16 pt-10 sm:px-8 md:pt-14">
      <Badge />
      <Reveal>
        <span className="tag mb-6">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blast" />
          Preflight gate for autonomous agents
        </span>
      </Reveal>

      <PhysicsHeadline />

      <div className="mt-10 grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-end">
        <Reveal delay={150}>
          <p className="max-w-xl text-xl leading-snug md:text-2xl">
            Blast Radius forks the sandbox, runs every risky action <em className="serif">in the fork only</em>,
            and compares the real diff against what the agent said it was about to do —{" "}
            <span className="bg-lime px-1">before anything real is touched.</span>
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Magnetic>
              <a href="#playground" className="btn btn-blast">
                <Roll>Play with the failure</Roll>
                <span aria-hidden>↓</span>
              </a>
            </Magnetic>
            <Magnetic>
              <a href={REPO_URL} className="btn" target="_blank" rel="noreferrer">
                <Roll>Read the code</Roll>
              </a>
            </Magnetic>
          </div>
          <p className="mt-7 flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-ink/60">
            <svg width="46" height="22" viewBox="0 0 46 22" fill="none" aria-hidden>
              <path d="M2 18c9-14 22-16 38-6m0 0-9-1m9 1-3 9" stroke="#11110f" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Go on. Click anything. Drag the letters.
          </p>
        </Reveal>

        <Reveal delay={300} rot={-2}>
          <div className="sheet grid grid-cols-3 divide-x-2 divide-ink overflow-hidden !rounded-[1.6rem] bg-paper">
            <Stat big={<><CountUp to={12} />/12</>} small="tool calls: exit 0" />
            <Stat big={<><CountUp to={3} />/47</>} small="files lost that shouldn’t be" tone="bg-blast" />
            <Stat big="½¢" small="per gated run" tone="bg-lime" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Stat({ big, small, tone = "" }: { big: React.ReactNode; small: string; tone?: string }) {
  return (
    <div className={`px-3 py-5 sm:px-5 ${tone}`}>
      <div className="display text-4xl tabular-nums sm:text-5xl">{big}</div>
      <div className="mt-2 text-[11px] font-medium leading-tight sm:text-sm">{small}</div>
    </div>
  )
}
