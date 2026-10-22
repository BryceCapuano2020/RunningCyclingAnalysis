import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
