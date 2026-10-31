import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { workoutKey } from './duplicates'
import { encodeFit } from './fit'
import { mulberry32 } from './math'
import { AnalysisSession, SyncFailure } from './session'
import type { SyncIssueCode, SyncSink } from './session'
import { DEFAULT_ATHLETE, generateActivity } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const DAY_MS = 24 * 3_600_000
const CASES = 20

function run(id: string, day: number, seed: number) {
  return generateActivity(
    DEFAULT_ATHLETE,
    {
      id,
      name: id,
      sport: 'run',
      startMs: Date.UTC(2020, 0, 1) + day * DAY_MS,
      durationS: 300,
      effort: 'easy',
      terrain: 'flat',
    },
    seed,
  )
}

/** Six runs, one workout recorded twice (with and without a GPS track), then three more runs. */
function libraryFiles(): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  for (let i = 0; i < 6; i++) files[`a${i}.fit`] = encodeFit(run(`a${i}`, i, i + 1), { gps: true })
  const pair = run('pair', 10, 50)
  files['pair-gps.fit'] = encodeFit(pair, { gps: true })
  files['pair-plain.fit'] = encodeFit(pair, { gps: false })
  for (let i = 0; i < 3; i++)
    files[`b${i}.fit`] = encodeFit(run(`b${i}`, 20 + i, 60 + i), { gps: true })
  return files
}

const FILES = libraryFiles()

/** The same files in an order the seed chooses, so either copy of the pair may arrive first. */
function zipFor(rand: () => number): File {
  const names = Object.keys(FILES)
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[names[i], names[j]] = [names[j]!, names[i]!]
  }
  return new File(
    [zipSync(Object.fromEntries(names.map((name) => [`activities/${name}`, FILES[name]!])))],
    'export.zip',
  )
}

interface Plan {
  /** How many of the first saves of the workout fail, and with what. */
  failures: Map<string, { count: number; code: SyncIssueCode }>
}

/**
 * Failures by workout, the way a flaky server and network give them: a few saves fail once or twice and then
 * work. At most two network failures in all, so the network never counts as down and the saves never probe.
 */
function planFor(seed: number, keys: string[]): Plan {
  const rand = mulberry32(seed * 7919 + 13)
  const failures = new Map<string, { count: number; code: SyncIssueCode }>()
  let network = 0
  for (const key of keys) {
    const roll = rand()
    const count = roll < 0.55 ? 0 : roll < 0.85 ? 1 : 2
    if (count === 0) continue
    const asNetwork = rand() < 0.3 && network + count <= 2
    if (asNetwork) network += count
    failures.set(key, { count, code: asNetwork ? 'network' : 'server' })
  }
  return { failures }
}

interface Outcome {
  sent: string[]
  issues: { code: SyncIssueCode; count: number; latest?: number }[]
  total: number
}

/** Imports the library with a sink that fails as planned, saving one after another or in the background. */
async function importWith(seed: number, plan: Plan, background: boolean): Promise<Outcome> {
  const delays = mulberry32(seed + 1000)
  const attempts = new Map<string, number>()
  const sent: string[] = []
  const work = async (key: string): Promise<void> => {
    const attempt = attempts.get(key) ?? 0
    attempts.set(key, attempt + 1)
    // Saves settle in an order of their own, as requests do.
    await new Promise((resolve) => setTimeout(resolve, delays() < 0.5 ? 0 : 1))
    const failure = plan.failures.get(key)
    if (failure !== undefined && attempt < failure.count) {
      throw new SyncFailure(failure.code, 'Planned failure')
    }
  }
  const sink: SyncSink = async (item) => {
    const key = workoutKey(item.digest.sport, item.digest.startMs)
    sent.push(item.fileName)
    if (!background || item.queueable !== true) return await work(key)
    const done = work(key)
    done.catch(() => undefined)
    return { done }
  }
  const session = new AnalysisSession()
  const state = await session.addFiles([zipFor(mulberry32(seed))], SETTINGS, undefined, sink)
  return {
    sent: sent.sort(),
    issues: [...state.syncIssues].sort((a, b) => a.code.localeCompare(b.code)),
    total: state.totalActivities,
  }
}

/** The workouts of the library: one key each, the pair counted once. */
const KEYS = [0, 1, 2, 3, 4, 5, 10, 20, 21, 22].map((day) =>
  workoutKey('run', Date.UTC(2020, 0, 1) + day * DAY_MS),
)

/** Seeds are split over two tests, so each stays well inside the time a slow runner allows. */
const HALVES: [string, number][] = [
  ['the first ten cases', 1],
  ['the next ten cases', 11],
]

describe('saving in the background gives the result of saving one after another', () => {
  it.each(HALVES)(
    'sends the same files and leaves the same activities unsaved, whichever copy of a workout arrives first: %s',
    async (_label, first) => {
      let pairRetried = 0
      for (let seed = first; seed < first + CASES / 2; seed++) {
        const plan = planFor(seed, KEYS)
        const sequential = await importWith(seed, plan, false)
        const background = await importWith(seed, plan, true)
        expect(background, `seed ${seed}`).toEqual(sequential)
        if (
          sequential.sent.includes('activities/pair-gps.fit') &&
          sequential.sent.includes('activities/pair-plain.fit')
        )
          pairRetried++
      }
      // The case under test happened: a copy of a workout whose first save failed was saved as its retry.
      expect(pairRetried).toBeGreaterThan(0)
    },
  )
})
