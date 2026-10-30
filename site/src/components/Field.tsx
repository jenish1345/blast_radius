import { useEffect, useRef } from "react"
import { reducedMotion, type BlastDetail } from "../lib/fx"

type Dot = { x: number; y: number; ox: number; oy: number }
type Wave = { x: number; y: number; t: number; p: number; c: string }

const INK = "17,17,15"

/**
 * A fixed grid of ink dots behind the whole page. The cursor parts them like water,
 * and every blast sends a ring through them that shoves them outward.
 */
export function Field() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext("2d")!
    const still = reducedMotion()
    let W = 0
    let H = 0
    let gap = 38
    let dots: Dot[] = []
    const waves: Wave[] = []
    const pointer = { x: -9999, y: -9999 }
    let raf = 0

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      gap = W < 640 ? 30 : 38
      dots = []
      for (let y = gap / 2; y < H + gap; y += gap) {
        for (let x = gap / 2; x < W + gap; x += gap) dots.push({ x, y, ox: 0, oy: 0 })
      }
      if (still) draw(performance.now())
    }

    const draw = (now: number) => {
      ctx.clearRect(0, 0, W, H)
      const off = still ? 0 : (window.scrollY * 0.4) % gap
      const R = 150
      // drop dead waves
      for (let i = waves.length - 1; i >= 0; i--) if ((now - waves[i].t) / 1000 > 1.7) waves.splice(i, 1)

      ctx.beginPath()
      const hot: { x: number; y: number; r: number; a: number; c: string }[] = []
      for (const d of dots) {
        const px = d.x
        const py = d.y - off
        let fx = 0
        let fy = 0
        let heat = 0
        let color = ""

        const dx = px - pointer.x
        const dy = py - pointer.y
        const d2 = dx * dx + dy * dy
        if (d2 < R * R && d2 > 0.01) {
          const dist = Math.sqrt(d2)
          const f = Math.pow(1 - dist / R, 2) * 48
          fx += (dx / dist) * f
          fy += (dy / dist) * f
          heat = Math.max(heat, (1 - dist / R) * 0.7)
        }
        for (const w of waves) {
          const age = (now - w.t) / 1000
          const r = age * 880
          const wx = px - w.x
          const wy = py - w.y
          const dist = Math.hypot(wx, wy) || 1
          const delta = Math.abs(dist - r)
          if (delta < 120) {
            const k = (1 - delta / 120) * (1 - age / 1.7) * w.p
            fx += (wx / dist) * k * 64
            fy += (wy / dist) * k * 64
            if (k > heat) {
              heat = k
              color = w.c
            }
          }
        }
        d.ox += (fx - d.ox) * 0.22
        d.oy += (fy - d.oy) * 0.22
        const x = px + d.ox
        const y = py + d.oy
        const r = 1.5 + heat * 3.6
        if (heat > 0.06) hot.push({ x, y, r, a: Math.min(1, 0.3 + heat), c: color || "255,75,31" })
        else {
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
      }
      ctx.fillStyle = `rgba(${INK},0.3)`
      ctx.fill()
      for (const h of hot) {
        ctx.fillStyle = h.c.includes(",") ? `rgba(${h.c},${h.a})` : h.c
        ctx.beginPath()
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const frame = (now: number) => {
      draw(now)
      raf = requestAnimationFrame(frame)
    }

    const hexToRgb = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16)
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    }
    const onBlast = (e: Event) => {
      const d = (e as CustomEvent<BlastDetail>).detail
      waves.push({ x: d.x, y: d.y, t: performance.now(), p: Math.min(1.4, d.power), c: hexToRgb(d.color) })
    }
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
    }
    const onLeave = () => {
      pointer.x = pointer.y = -9999
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !still) raf = requestAnimationFrame(frame)
    }

    build()
    if (!still) raf = requestAnimationFrame(frame)
    window.addEventListener("resize", build)
    window.addEventListener("blast", onBlast)
    window.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("pointerleave", onLeave)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", build)
      window.removeEventListener("blast", onBlast)
      window.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0" />
}
