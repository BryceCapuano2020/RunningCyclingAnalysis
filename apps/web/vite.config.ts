/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    // The API runs under `wrangler dev`; proxying keeps cookies same-origin in development.
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
