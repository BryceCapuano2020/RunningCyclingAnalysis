import { defineConfig } from 'vitest/config'

// Heavy API sweeps (*.sim.test.ts): every request of a daily limit, a worst-case backlog, a long
// keyset walk. Each one holds a case the unit run also decides in a few requests; these run the
// whole sweep. The unit run excludes them and the CI job "Statistical simulations" runs them here,
// without coverage. Same Miniflare setup as the unit tests, with room for a slow runner.
export default defineConfig({
  test: {
    name: 'api-sim',
    environment: 'node',
    include: ['src/**/*.sim.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
