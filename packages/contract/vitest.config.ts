import { configDefaults, defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@rca/contract',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The exhaustive digest-reader sweep runs in test:sim (vitest.sim.config.ts); the unit run keeps a sample.
    exclude: [...configDefaults.exclude, 'src/**/*.sim.test.ts'],
  },
})
