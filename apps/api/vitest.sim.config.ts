import { defineConfig } from 'vitest/config'

// Heavy API sweeps (*.sim.test.ts): every request of a daily limit, a worst-case backlog, a long
// keyset walk. Each one holds a case the unit run also decides in a few requests; these run the
// whole sweep. The unit run excludes them and the CI job "Statistical simulations" runs them here,
// without coverage. Same Miniflare setup as the unit tests, with room for a slow runner.
export default defineConfig({
  test: {
    name: 'api-sim',
    environment: 'node',
    // They are small beside the core's, so with SIM_SHARD set (the CI job's "index/count") they run in the first shard only.
    include: /^[2-9]\//.test(process.env.SIM_SHARD ?? '') ? [] : ['src/**/*.sim.test.ts'],
    passWithNoTests: true,
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
