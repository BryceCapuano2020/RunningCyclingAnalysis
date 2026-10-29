import { configDefaults, defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Wall-clock, timing and heap tests run in test:perf, alone and without coverage; statistical
    // simulations run in test:sim, without coverage.
    exclude: [...configDefaults.exclude, 'src/**/*.perf.test.ts', 'src/**/*.sim.test.ts'],
  },
})
