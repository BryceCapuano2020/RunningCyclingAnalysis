import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import type { Connect, Plugin } from 'vite'
import { RULES_MARKER, immutableAssetRules } from './scripts/assetHeaders.ts'
import { e2eApiPort } from './e2e/ports.ts'

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

/** Appends one cache rule for each built asset to dist/_headers; see scripts/assetHeaders.ts for why not a pattern. */
function immutableAssets(): Plugin {
  let outDir = ''
  return {
    name: 'rca-immutable-assets',
    apply: 'build',
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle: () => {
      const headers = join(outDir, '_headers')
      if (readFileSync(headers, 'utf8').includes(RULES_MARKER)) return
      appendFileSync(headers, immutableAssetRules(readdirSync(join(outDir, 'assets'))))
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), cleanUrls(), immutableAssets()],
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
      },
    },
  },
  server: {
    // Must match the local Google OAuth redirect URI (see docs/DEPLOY.md).
    port: 5183,
    strictPort: true,
    // The API runs under `wrangler dev`; proxying keeps cookies same-origin in development.
    proxy: { '/api': 'http://localhost:8787' },
  },
  preview: {
    // The e2e web server; E2E_API_PORT selects the API it proxies to (default 8787).
    proxy: { '/api': `http://localhost:${e2eApiPort}` },
  },
  test: {
    name: 'web',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Timing budgets run in test:perf, alone and without the parallel unit run.
    exclude: [...configDefaults.exclude, 'src/**/*.perf.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
