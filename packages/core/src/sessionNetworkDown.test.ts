import { zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeFit } from './fit'
import { AnalysisSession, SyncFailure } from './session'
import { DEFAULT_ATHLETE, generateActivity } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const DAY_MS = 24 * 3_600_000
const COUNT = 2_000
// The real timer, kept before the fake ones are installed, to let the import's own work run.
const realSetTimeout = globalThis.setTimeout

/** A zip of short runs, one a day apart, so none is a duplicate of another. */
function zipOfRuns(count: number): File {
  const entries: Record<string, Uint8Array> = {}
  for (let i = 0; i < count; i++) {
    const activity = generateActivity(
      DEFAULT_ATHLETE,
      {
        id: `run-${i}`,
        name: `Run ${i}`,
        sport: 'run',
        startMs: Date.UTC(2020, 0, 1) + i * DAY_MS,
        durationS: 300,
        effort: 'easy',
        terrain: 'flat',
      },
      i + 1,
    )
    entries[`activities/${i}.fit`] = encodeFit(activity, { gps: true })
  }
  return new File([zipSync(entries)], 'export.zip')
}

describe('AnalysisSession with the network down', () => {
  afterEach(() => vi.useRealTimers())

  it('stops saving after three timed-out saves and reports all 2,000 activities unsaved', async () => {
    const session = new AnalysisSession()
    const file = zipOfRuns(COUNT)
    let attempts = 0
    // Each save hangs to the request timeout, then fails as a network error.
    const hangs = () =>
      new Promise<void>((_, reject) => {
        attempts++
        setTimeout(() => reject(new SyncFailure('network', 'Timed out')), 31_000)
      })

    // Only the request timeouts are faked; the import's own work still runs in real time.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const started = Date.now()
    let state: Awaited<ReturnType<AnalysisSession['addFiles']>> | undefined
    const done = session.addFiles([file], SETTINGS, undefined, hangs).then((s) => (state = s))
    while (state === undefined) {
      if (vi.getTimerCount() > 0) await vi.advanceTimersToNextTimerAsync()
      else await new Promise((resolve) => realSetTimeout(resolve, 0))
    }
    await done

    expect(attempts).toBe(3)
    expect(Date.now() - started).toBe(3 * 31_000)
    expect(state.totalActivities).toBe(COUNT)
    expect(state.syncIssues).toEqual([{ code: 'network', count: COUNT }])
  }, 60_000)

  it('keeps saving when network failures are not three in a row', async () => {
    const session = new AnalysisSession()
    const file = zipOfRuns(8)
    let calls = 0
    const state = await session.addFiles([file], SETTINGS, undefined, async () => {
      calls++
      // Fail, fail, succeed, repeated: a streak never reaches three.
      if (calls % 3 !== 0) throw new SyncFailure('network', 'Offline')
    })

    expect(calls).toBe(8)
    expect(state.syncIssues).toEqual([{ code: 'network', count: 6 }])
  })
})
