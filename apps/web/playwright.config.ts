import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { e2eApiPort, e2eWebPort } from './e2e/ports.ts'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  testDir: 'e2e',
  // Makes the legacy libraries before any test runs; see legacySeed.ts.
  globalSetup: './e2e/legacySeed.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The sample's wait (openSample, 20 s) must fit inside a test, so each test gets 60 s.
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${e2eWebPort}`, trace: 'retain-on-first-failure' },
  projects: [
    // The memory of a big import is measured once, on the Pixel 7 Chromium project (phone-memory.spec.ts).
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /phone-memory\.spec\.ts$/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'] },
      testIgnore: /phone-memory\.spec\.ts$/,
    },
    // The narrowest phone the layout must work at, checked by the accessibility suite and the failure notices.
    {
      name: 'narrow-320',
      use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } },
      testMatch: /(accessibility|failed-saves|api-unreachable)\.spec\.ts$/,
    },
    // WCAG 1.4.10 Reflow: a 1280 px page at 400% zoom is 320 x 256, and scrolls one way only.
    {
      name: 'reflow-320x256',
      use: { ...devices['Pixel 7'], viewport: { width: 320, height: 256 } },
      testMatch: /reflow\.spec\.ts$/,
    },
  ],
  webServer: [
    {
      // The real API on a throwaway local D1 and R2, so the signed-in tests exercise it.
      command: 'npm run e2e:api -w @rca/api',
      cwd: repoRoot,
      url: `http://localhost:${e2eApiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run preview -- --port ${e2eWebPort} --strictPort`,
      url: `http://localhost:${e2eWebPort}`,
      reuseExistingServer: false,
    },
  ],
})
