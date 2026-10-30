import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react"
import { reducedMotion } from "./fx"

/** Smoothed scroll velocity (px/frame), shared by anything that wants to lean into the scroll. */
export const motion = { vel: 0 }

/** One rAF loop: scroll progress var + smoothed velocity. */
export function useGlobalMotion() {
  useEffect(() => {
    const root = document.documentElement
    let raf = 0
    let last = window.scrollY
    let lastProgress = -1
    const tick = () => {
      const y = window.scrollY
      motion.vel += ((y - last) - motion.vel) * 0.15
      last = y
      const max = root.scrollHeight - window.innerHeight
      const p = max > 0 ? y / max : 0
      if (Math.abs(p - lastProgress) > 0.0005) {
        root.style.setProperty("--progress", p.toFixed(4))
        lastProgress = p
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}

/** True once the element has entered the viewport (one-shot). */
export function useInView<T extends Element>(threshold = 0.01) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (reducedMotion() || typeof IntersectionObserver === "undefined") {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold, rootMargin: "0px 0px -6% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen, threshold])
  return [ref, seen] as const
}

/** Springy pop-in. `rot` sets the crooked angle it straightens from. */
export function Reveal({
  children,
  delay = 0,
  as,
  className = "",
  rot = 1.5,
  style,
}: {
  children: ReactNode
  delay?: number
  as?: ElementType
  className?: string
  rot?: number
  style?: CSSProperties
}) {
  const Tag = (as ?? "div") as ElementType
  const [ref, seen] = useInView<HTMLElement>()
  return (
    <Tag
      ref={ref}
      className={`reveal ${seen ? "in" : ""} ${className}`}
      style={{ ...style, ["--d" as string]: `${delay}ms`, ["--rot" as string]: `${rot}deg` }}
    >
      {children}
    </Tag>
  )
}

/** Headline lines that wipe up out of a mask. */
export function Wipe({
  lines,
  className = "",
  delay = 0,
}: {
  lines: ReactNode[]
  className?: string
  delay?: number
}) {
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={`${seen ? "in" : ""} ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className="wipe">
          <span style={{ ["--d" as string]: `${delay + i * 110}ms` }}>{l}</span>
        </span>
      ))}
    </div>
  )
}

/** Count from 0 → `to` once visible. */
export function CountUp({ to, duration = 1400 }: { to: number; duration?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.5)
  const [n, setN] = useState(reducedMotion() ? to : 0)
  useEffect(() => {
    if (!seen) return
    if (reducedMotion()) {
      setN(to)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1)
      setN(Math.round(to * (1 - Math.pow(1 - p, 4))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, to, duration])
  return <span ref={ref}>{n}</span>
}

/** Wraps a button: it leans toward the pointer and springs back on leave. */
export function Magnetic({ children, strength = 0.35 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      el.style.transition = "transform 0.15s ease-out"
      el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`
    }
    const leave = () => {
      el.style.transition = "transform 0.7s cubic-bezier(0.34,1.56,0.64,1)"
      el.style.transform = ""
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
    }
  }, [strength])
  return (
    <span ref={ref} className="inline-block">
      {children}
    </span>
  )
}

/** Grab-and-fling: drag it anywhere, it springs home with a wobble. */
export function Drag({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion()) return
    let x = 0,
      y = 0,
      vx = 0,
      vy = 0,
      ox = 0,
      oy = 0,
      dragging = false,
      raf = 0
    const render = () => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${Math.max(-14, Math.min(14, vx * 0.7))}deg) scale(${dragging ? 1.04 : 1})`
    }
    const loop = () => {
      if (!dragging) {
        vx += -x * 0.09
        vy += -y * 0.09
        vx *= 0.84
        vy *= 0.84
        x += vx
        y += vy
      }
      render()
      if (dragging || Math.abs(x) + Math.abs(y) + Math.abs(vx) + Math.abs(vy) > 0.08) {
        raf = requestAnimationFrame(loop)
      } else {
        el.style.transform = ""
        el.style.zIndex = ""
        raf = 0
      }
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }
    const down = (e: PointerEvent) => {
      dragging = true
      ox = e.clientX - x
      oy = e.clientY - y
      el.setPointerCapture(e.pointerId)
      el.style.zIndex = "30"
      kick()
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const nx = e.clientX - ox
      const ny = e.clientY - oy
      vx = nx - x
      vy = ny - y
      x = nx
      y = ny
    }
    const up = () => {
      dragging = false
      kick()
    }
    el.addEventListener("pointerdown", down)
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
    return () => {
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      el.removeEventListener("pointercancel", up)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div ref={ref} className={`select-none ${className}`} style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  )
}

export function Roll({ children }: { children: string }) {
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  )
}
