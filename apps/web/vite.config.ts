/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Connect, Plugin } from 'vite'

/** Workers Assets serves /privacy.html at /privacy; the Vite servers do the same for parity. */
function cleanUrls(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url === '/privacy' || req.url?.startsWith('/privacy?')) {
      req.url = req.url.replace('/privacy', '/privacy.html')
    }
    next()
  }
  return {
    name: 'rca-clean-urls',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), cleanUrls()],
  worker: { format: 'es' },
  server: {
    // Must match the local Google OAuth redirect URI (see docs/DEPLOY.md).
    port: 5183,
    strictPort: true,
    // The API runs under `wrangler dev`; proxying keeps cookies same-origin in development.
    proxy: { '/api': 'http://localhost:8787' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    name: 'web',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
