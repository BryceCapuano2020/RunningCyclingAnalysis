import { defineConfig } from 'vitest/config'

// Timing budgets for the web app. They run one file at a time on one worker, so the CPU is not shared
// with other tests, and they stay out of the unit run, which is deterministic.
export default defineConfig({
  test: {
    name: 'web-perf',
    environment: 'node',
    include: ['src/**/*.perf.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
})
