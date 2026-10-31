import { defineConfig } from 'vitest/config'

// The digest-reader sweep over every mutant (*.sim.test.ts). The unit run keeps a sample of them
// (FUZZ_SCALE unset); the CI job "Statistical simulations" runs them all here, without coverage.
export default defineConfig({
  test: {
    name: 'contract-sim',
    environment: 'node',
    include: ['src/**/*.sim.test.ts'],
    testTimeout: 180_000,
    env: { FUZZ_SCALE: '10' },
  },
})
