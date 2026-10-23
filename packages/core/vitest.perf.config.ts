import { defineConfig } from 'vitest/config'

// Timing and heap budgets. They run one file at a time on one worker, without coverage, so the
// CPU is not shared with other tests. The config passes --expose-gc for the heap assertions.
export default defineConfig({
  test: {
    name: 'core-perf',
    environment: 'node',
    include: ['src/**/*.perf.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    execArgv: ['--expose-gc'],
    testTimeout: 120_000,
  },
})
