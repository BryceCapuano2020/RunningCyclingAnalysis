import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4319', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      // The real API on a throwaway local D1 and R2, so the signed-in tests exercise it.
      command: 'npm run e2e:api -w @rca/api',
      cwd: repoRoot,
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run preview -- --port 4319 --strictPort',
      url: 'http://localhost:4319',
      reuseExistingServer: false,
    },
  ],
})
