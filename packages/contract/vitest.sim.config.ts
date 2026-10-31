import { defineConfig } from 'vitest/config'

// The digest-reader sweep over every mutant (*.sim.test.ts). The unit run keeps a sample of them
// (FUZZ_SCALE unset); the CI job "Statistical simulations" runs them all here, without coverage.
export default defineConfig({
  test: {
    name: 'contract-sim',
    environment: 'node',
    // They are small beside the core's, so with SIM_SHARD set (the CI job's "index/count") they run in the first shard only.
    include: /^[2-9]\//.test(process.env.SIM_SHARD ?? '') ? [] : ['src/**/*.sim.test.ts'],
    passWithNoTests: true,
    testTimeout: 180_000,
    env: { FUZZ_SCALE: '10' },
  },
})
