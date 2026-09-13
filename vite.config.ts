import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // Build fingerprint shown in Settings so screenshots self-identify the deploy.
  define: {
    __GIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local"),
  },
})
