import { defineConfig } from 'vitest/config'

// Statistical simulations (*.sim.test.ts): many seeded libraries replayed week by week, to measure a
// detector's hit rate and its silence on nulls. They take minutes under coverage, so the unit run
// excludes them and the CI job "Statistical simulations" runs them here, without coverage.
export default defineConfig({
  test: {
    name: 'core-sim',
    environment: 'node',
    include: ['src/**/*.sim.test.ts'],
    testTimeout: 180_000,
  },
})
