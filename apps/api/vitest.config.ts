import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Sweeps that send hundreds of requests through Miniflare run in test:sim (vitest.sim.config.ts),
    // in CI's simulation job, so a loaded runner cannot fail the unit tests on them.
    exclude: [...configDefaults.exclude, 'src/**/*.sim.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
