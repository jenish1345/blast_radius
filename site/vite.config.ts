import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// VITE_BASE lets the same build be served from a sub-path (e.g. /blast_radius/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_")
  return {
    base: env.VITE_BASE ?? "/",
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
  }
})
