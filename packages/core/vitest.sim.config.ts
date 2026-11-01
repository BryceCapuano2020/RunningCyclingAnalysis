import { readdirSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

/**
 * What each simulation file takes on a CI runner, in seconds (from the job log of 31 Oct, rounded). It only balances the
 * shards: a file not listed counts as UNLISTED_S, and a stale figure costs some imbalance, never a skipped file.
 */
const SECONDS: Record<string, number> = {
  'src/findings/detectors/fitnessStatus.sim.test.ts': 290,
  'src/effort/gate.passing.sim.test.ts': 286,
  'src/effort/gate.held.sim.test.ts': 195,
  'src/effort/gate.limits.sim.test.ts': 191,
  'src/lookback/agreement.sim.test.ts': 180,
  'src/synthetic/noise/heldOut.heldout.sim.test.ts': 133,
  'src/fitness/episode.sim.test.ts': 87,
  'src/fitness/rideSeason.sim.test.ts': 54,
  'src/fitness/heat.sim.test.ts': 46,
  'src/findings/protoEfficiency.sim.test.ts': 40,
  'src/fitness/ride.sim.test.ts': 31,
  'src/change/change.sim.test.ts': 30,
  'src/predict/vo2max.gate.sim.test.ts': 28,
  'src/findings/registry.sim.test.ts': 26,
  'src/fitness/monitor.sim.test.ts': 25,
  'src/lookback/hindsight.sim.test.ts': 24,
  'src/synthetic/noise/personas.sim.test.ts': 24,
  'src/tcx/parse.fuzz.sim.test.ts': 22,
  'src/fitness/rise.sim.test.ts': 21,
  'src/gpx/parse.fuzz.sim.test.ts': 19,
  'src/digest/referenceMax.cadenceLock.sim.test.ts': 11,
  'src/profile/standOut.sim.test.ts': 10,
  'src/synthetic/sampleSeason.sim.test.ts': 9,
  'src/synthetic/noise/presets.sim.test.ts': 5,
}
const UNLISTED_S = 30

/** Every simulation file under src, as a path from the package. */
function simFiles(dir = 'src'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return simFiles(path)
    return entry.name.endsWith('.sim.test.ts') ? [path] : []
  })
}

/**
 * The files of one shard when SIM_SHARD is "index/count" (the CI job sets it), else all of them. The heaviest file goes to
 * the lightest shard so far, so the shards take about as long; vitest's own --shard splits by file name, which put the
 * four heaviest files in one shard. Every file is in exactly one shard.
 */
function shardOf(spec: string | undefined): string[] {
  const files = simFiles()
  const [index, count] = (spec ?? '').split('/').map(Number)
  if (index === undefined || count === undefined || !(index >= 1 && index <= count)) return files
  const weight = (file: string) => SECONDS[file] ?? UNLISTED_S
  const loads = Array.from({ length: count }, () => 0)
  const bins: string[][] = loads.map(() => [])
  for (const file of [...files].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1))) {
    const lightest = loads.indexOf(Math.min(...loads))
    loads[lightest]! += weight(file)
    bins[lightest]!.push(file)
  }
  return bins[index - 1]!
}

// Statistical simulations (*.sim.test.ts): many seeded libraries replayed week by week, to measure a
// detector's hit rate and its silence on nulls. They take minutes under coverage, so the unit run
// excludes them and the CI job "Statistical simulations" runs them here, without coverage.
export default defineConfig({
  test: {
    name: 'core-sim',
    environment: 'node',
    include: shardOf(process.env.SIM_SHARD),
    testTimeout: 180_000,
    // Scales the mutation fuzz tests (src/*/parse.fuzz.test.ts), which keep a small sample in the unit run.
    env: { FUZZ_SCALE: '20' },
  },
})
