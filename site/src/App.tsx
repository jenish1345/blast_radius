import { Navbar } from "./components/Navbar"
import { Hero } from "./components/Hero"
import { Marquee } from "./components/Marquee"
import { Playground } from "./components/Playground"
import { HowItWorks } from "./components/HowItWorks"
import { Verdicts } from "./components/Verdicts"
import { Models } from "./components/Models"
import { Limits } from "./components/Limits"
import { Faq } from "./components/Faq"
import { Cta, Footer } from "./components/Footer"
import { Field } from "./components/Field"
import { Cursor } from "./components/Cursor"
import { useGlobalMotion } from "./lib/motion"

export default function App() {
  useGlobalMotion()
  return (
    <>
      <Field />
      <Cursor />
      <Navbar />
      <main className="pt-20">
        <Hero />
        <Marquee />
        <Playground />
        <HowItWorks />
        <Verdicts />
        <Models />
        <Limits />
        <Faq />
      </main>
      <Cta />
      <Footer />
    </>
  )
}
