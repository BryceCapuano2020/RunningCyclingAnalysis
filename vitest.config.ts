import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**/*.ts',
        'apps/api/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
        'packages/contract/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/test/**',
        'apps/web/src/main.tsx',
        'apps/web/src/**/*.d.ts',
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
        : {
            lines: 90,
            functions: 90,
            branches: 85,
            statements: 90,
            // Each below what the package reaches now (web 98.9 / 98.9 / 94.0 / 97.8, its worker 89.4 / 86.2 /
            // 81.9 / 87.1, contract 100 / 100 / 98.5 / 100), by a margin that a few untested branches use up but a
            // dropped suite does not. The aggregate above averages the packages, so one could slide while it holds.
            'apps/web/src/**': { lines: 97, functions: 97, branches: 92, statements: 96 },
            'apps/web/src/worker/**': { lines: 87, functions: 84, branches: 79, statements: 85 },
            'packages/contract/src/**': { lines: 98, functions: 98, branches: 96, statements: 98 },
          },
    },
  },
})
