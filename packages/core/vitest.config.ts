import { configDefaults, defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Wall-clock, timing and heap tests run in test:perf, alone and without coverage; statistical
    // simulations run in test:sim, without coverage.
    exclude: [...configDefaults.exclude, 'src/**/*.perf.test.ts', 'src/**/*.sim.test.ts'],
    // The 5 s default failed about 1 in 10 CI jobs: a test of well under a second alone takes several on a loaded
    // runner under coverage. 15 s is a guard against a hang, not a budget; a test that needs more says why.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
})
