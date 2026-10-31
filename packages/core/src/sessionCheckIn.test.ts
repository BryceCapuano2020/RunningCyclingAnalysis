import { describe, expect, it } from 'vitest'
import { MODEL_REVISION } from './digest/modelRevision'
import { decodeSeconds } from './lookback'
import { buildFit, secondly } from './fit/fitTestFiles'
import { AnalysisSession } from './session'
import type { AthleteSettings } from './types'

/** The snapshot "since your last import" is taken from: the library as the analysis reads it. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const NOW = Date.UTC(2024, 5, 1, 12)
const START = Date.UTC(2024, 4, 1, 7, 30)

const fit = (name: string, startMs: number) =>
  new File(
    [
      new Uint8Array(
        buildFit({
          sessions: [
            {
              sport: 'running' as const,
              startMs,
              durationS: 120,
              records: secondly(startMs, 120, { speed: 3, altitude: 50, heartRate: 150 }),
            },
          ],
        }),
      ),
    ],
    name,
  )

describe('AnalysisSession.checkInSnapshot', () => {
  it('is null for an empty library and for the sample', async () => {
    const session = new AnalysisSession()
    expect(session.checkInSnapshot(session.setSettings(SETTINGS), NOW)).toBeNull()
    const sampled = new AnalysisSession()
    expect(sampled.checkInSnapshot(sampled.loadSample(SETTINGS), NOW)).toBeNull()
  })

  it('holds the workouts of the library, at the model revision and the time it was taken', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fit('a.fit', START), fit('b.fit', START + 86_400_000)], SETTINGS)
    const state = session.setSettings(SETTINGS)
    const snapshot = session.checkInSnapshot(state, NOW)!
    expect(snapshot.revision).toBe(MODEL_REVISION)
    expect(snapshot.atMs).toBe(NOW)
    expect(snapshot.counts).toEqual({ run: 2, ride: 0 })
    expect(decodeSeconds(snapshot.keys.run)).toEqual([START / 1000, (START + 86_400_000) / 1000])
    expect(snapshot.asOfMs).toBe(START + 86_400_000)
  })

  it('is the same for the same library and clock, and does not grow when a file is added twice', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fit('a.fit', START)], SETTINGS)
    const first = session.checkInSnapshot(session.setSettings(SETTINGS), NOW)
    await session.addFiles([fit('a-again.fit', START)], SETTINGS)
    const again = session.checkInSnapshot(session.setSettings(SETTINGS), NOW)
    expect(again).toEqual(first)
  })
})
