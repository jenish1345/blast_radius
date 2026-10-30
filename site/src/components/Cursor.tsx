import { useEffect, useRef } from "react"
import { blast, reducedMotion } from "../lib/fx"

/** Lens cursor + a shockwave on every press, anywhere on the page. Touch devices get the shockwave only. */
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches
    const reduced = reducedMotion()
    let last = 0
    const onDown = (e: PointerEvent) => {
      const now = performance.now()
      if (now - last < 90) return
      last = now
      blast(e.clientX, e.clientY, 1)
    }
    window.addEventListener("pointerdown", onDown, { passive: true })

    let raf = 0
    let cleanup = () => {}
    if (fine && !reduced) {
      document.documentElement.classList.add("has-cursor")
      const r = ring.current!
      const d = dot.current!
      let x = -100,
        y = -100,
        rx = x,
        ry = y,
        rs = 1,
        target = 1,
        seen = false,
        hot = false,
        down = false
      const move = (e: PointerEvent) => {
        x = e.clientX
        y = e.clientY
        if (!seen) {
          seen = true
          rx = x
          ry = y
          r.style.opacity = d.style.opacity = "1"
        }
        const t = e.target as HTMLElement | null
        hot = !!t?.closest?.("a,button,summary,input,[data-hot]")
      }
      const pd = () => (down = true)
      const pu = () => (down = false)
      const tick = () => {
        rx += (x - rx) * 0.2
        ry += (y - ry) * 0.2
        target = down ? 0.65 : hot ? 1.9 : 1
        rs += (target - rs) * 0.22
        d.style.transform = `translate3d(${x - 4}px, ${y - 4}px, 0)`
        r.style.transform = `translate3d(${rx - 19}px, ${ry - 19}px, 0) scale(${rs})`
        r.classList.toggle("hot", hot)
        raf = requestAnimationFrame(tick)
      }
      window.addEventListener("pointermove", move, { passive: true })
      window.addEventListener("pointerdown", pd)
      window.addEventListener("pointerup", pu)
      raf = requestAnimationFrame(tick)
      cleanup = () => {
        document.documentElement.classList.remove("has-cursor")
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerdown", pd)
        window.removeEventListener("pointerup", pu)
      }
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("pointerdown", onDown)
      cleanup()
    }
  }, [])

  return (
    <>
      <div ref={ring} className="cur-ring" aria-hidden />
      <div ref={dot} className="cur-dot" aria-hidden />
    </>
  )
}
