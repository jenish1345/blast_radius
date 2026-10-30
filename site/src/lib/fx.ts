/** Shared effects. Everything here is a no-op under prefers-reduced-motion. */

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export const PALETTE = ["#ff4b1f", "#2f3bff", "#cdf25a", "#ffb3d1", "#11110f"]

export type BlastDetail = { x: number; y: number; power: number; color: string }

/** A shockwave: a DOM ring + an event the background field and hero letters react to. */
export function blast(x: number, y: number, power = 1, color = "#ff4b1f") {
  if (reducedMotion()) return
  window.dispatchEvent(new CustomEvent<BlastDetail>("blast", { detail: { x, y, power, color } }))
  const el = document.createElement("div")
  el.className = "shock"
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  el.style.setProperty("--c", color)
  el.style.setProperty("--s", `${180 + power * 260}px`)
  el.addEventListener("animationend", () => el.remove())
  document.body.appendChild(el)
}

export function confetti(x: number, y: number, count = 36) {
  if (reducedMotion()) return
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i")
    const size = 7 + Math.random() * 9
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() > 0.5 ? 1 : 0.45)}px;z-index:98;pointer-events:none;background:${
      PALETTE[i % PALETTE.length]
    };border-radius:${Math.random() > 0.5 ? "50%" : "2px"}`
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
    const v = 240 + Math.random() * 460
    const dx = Math.cos(ang) * v
    const dy = Math.sin(ang) * v
    const spin = (Math.random() - 0.5) * 900
    document.body.appendChild(el)
    el.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.7}px,${dy * 0.7}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px,${dy + 520}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 700, easing: "cubic-bezier(.2,.6,.4,1)" },
    ).onfinish = () => el.remove()
  }
}

export function shake(el: HTMLElement | null) {
  if (!el || reducedMotion()) return
  el.classList.remove("shake")
  void el.offsetWidth
  el.classList.add("shake")
  window.setTimeout(() => el.classList.remove("shake"), 480)
}

export function centerOf(el: Element) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
