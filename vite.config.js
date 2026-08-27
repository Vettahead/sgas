import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel exposes the deployed commit as VERCEL_GIT_COMMIT_SHA at build time.
// We bake a short version of it in as __COMMIT__ so the app can always show
// exactly which push is live (see src/lib/version.js).
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)

export default defineConfig({
  plugins: [react()],
  define: { __COMMIT__: JSON.stringify(commit) },
  server: { port: 5173, open: true }
})
