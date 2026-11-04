import { configDefaults, defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'evals',
    environment: 'node',
    include: ['owner-caught/**/*.test.ts'],
    // A heavy sweep is a *.sim.test.ts, which the unit jobs leave out.
    exclude: [...configDefaults.exclude, 'owner-caught/**/*.sim.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
})
