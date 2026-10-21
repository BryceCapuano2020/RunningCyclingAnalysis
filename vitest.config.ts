import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts', 'apps/api/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/test/**',
        'packages/core/src/types.ts',
        'packages/core/src/fit/fitTestFiles.ts',
        'packages/core/src/virtualPower/syntheticRides.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
