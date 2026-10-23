import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { e2eApiPort } from './e2e/ports.ts'

/** Exercises Workers Static Assets and /api together, including deployed response headers. */
export default defineConfig({
  testDir: 'e2e-worker',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  use: { baseURL: `http://localhost:${e2eApiPort}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'worker', use: { ...devices['Desktop Chrome'] } },
    { name: 'worker-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run e2e:api -w @rca/api',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: `http://localhost:${e2eApiPort}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
