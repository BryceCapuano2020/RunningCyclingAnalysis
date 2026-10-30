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
        'packages/core/src/gpx/encode.ts',
        'packages/core/src/tcx/encode.ts',
        'packages/core/src/virtualPower/syntheticRides.ts',
      ],
      // A CI shard (COVERAGE_SHARD set) only records its part; the merge step applies the thresholds
      // to the whole run, so a shard's partial coverage never fails on its own.
      thresholds: process.env.COVERAGE_SHARD
        ? undefined
        : { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
