import { useEffect, useRef } from "react"
import { motion } from "../lib/motion"
import { reducedMotion } from "../lib/fx"

const ITEMS = [
  ["EXIT 0 ✓", "text-lime"],
  ["47 FILES GONE", "text-blast"],
  ["COST NORMAL ✓", "text-lime"],
  ["YOU MEANT 44", "text-bone"],
  ["ERRORS: 0 ✓", "text-lime"],
  ["3 WERE WRITTEN TODAY", "text-blast"],
] as const

/** A tilted ticker band. It speeds up and leans with your scroll. */
export function Marquee() {
  const track = useRef<HTMLDivElement>(null)
  const band = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = track.current!
    const b = band.current!
    if (reducedMotion()) return
    let x = 0
    let raf = 0
    const tick = () => {
      const half = el.scrollWidth / 2
      x -= 1.1 + Math.abs(motion.vel) * 0.9
      if (x <= -half) x += half
      el.style.transform = `translate3d(${x}px,0,0)`
      b.style.transform = `rotate(-2.2deg) skewX(${Math.max(-12, Math.min(12, -motion.vel * 0.5))}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const row = [...ITEMS, ...ITEMS, ...ITEMS, ...ITEMS]
  return (
    <div className="relative z-10 -mx-4 my-16 overflow-hidden py-4">
      <div ref={band} className="border-y-2 border-ink bg-ink py-4 text-bone" style={{ transform: "rotate(-2.2deg)" }}>
        <div ref={track} className="flex w-max gap-10 whitespace-nowrap will-change-transform">
          {row.map(([t, c], i) => (
            <span key={i} className={`display flex items-center gap-10 text-4xl sm:text-6xl ${c}`}>
              {t}
              <span aria-hidden className="text-bone/40">
                ✺
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
