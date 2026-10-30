import { useEffect, useRef, useState } from "react"
import { REPO_URL } from "../links"
import { Roll } from "../lib/motion"

const LINKS = [
  { label: "Playground", id: "playground" },
  { label: "How", id: "how" },
  { label: "Verdicts", id: "verdicts" },
  { label: "Models", id: "models" },
  { label: "FAQ", id: "faq" },
]

export function Navbar() {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setHidden(y > lastY.current && y > 200)
      lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-[var(--ease-out-expo)] ${
        hidden ? "-translate-y-full" : ""
      }`}
    >
      <nav
        aria-label="Main"
        className="mx-auto mt-3 flex w-[min(1500px,calc(100%-1.5rem))] items-center justify-between rounded-full border-2 border-ink bg-paper/95 py-2 pl-3 pr-2 shadow-[4px_4px_0_var(--color-ink)] backdrop-blur"
      >
        <a href="#top" className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9 transition-transform duration-500 hover:rotate-[200deg]" />
          <span className="text-xl font-extrabold tracking-tight">Blast Radius</span>
        </a>
        <ul className="hidden items-center gap-1 text-[15px] font-medium md:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a href={`#${l.id}`} className="rounded-full px-4 py-2 transition-colors hover:bg-ink hover:text-bone">
                <Roll>{l.label}</Roll>
              </a>
            </li>
          ))}
        </ul>
        <a href={REPO_URL} className="btn btn-ink !px-5 !py-2 text-sm" target="_blank" rel="noreferrer">
          <Roll>GitHub</Roll> <span aria-hidden>↗</span>
        </a>
      </nav>
      {/* scroll progress, drawn in the nav's own ink */}
      <div
        aria-hidden
        className="mx-auto mt-1.5 h-1 w-[min(1500px,calc(100%-3rem))] origin-left rounded-full bg-blast"
        style={{ transform: "scaleX(var(--progress, 0))" }}
      />
    </header>
  )
}
