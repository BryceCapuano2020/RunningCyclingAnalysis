import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { encodeGpx } from './gpx/encode'
import { AnalysisSession, SyncFailure } from './session'
import { DEFAULT_ATHLETE, generateActivity } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

const ride = generateActivity(
  DEFAULT_ATHLETE,
  {
    id: 'ride-1',
    name: 'Ride 1',
    sport: 'ride',
    startMs: Date.UTC(2020, 0, 1, 8),
    durationS: 900,
    effort: 'easy',
    terrain: 'flat',
  },
  1,
)
const gpx = () => new File([new Uint8Array(encodeGpx(ride))], 'ride.gpx')
const fit = () => new File([new Uint8Array(encodeFit(ride, { gps: true }))], 'ride.fit')

describe('AnalysisSession when the server refuses a richer copy', () => {
  it('keeps the copy the server holds, and still reports the conflict', async () => {
    const session = new AnalysisSession()
    await session.addFiles([gpx()], SETTINGS, undefined, async () => {})
    const replaced: string[] = []
    const kept: string[] = []
    const state = await session.addFiles(
      [fit()],
      SETTINGS,
      undefined,
      async () => {
        throw new SyncFailure('activity-conflict', 'saved from a different file')
      },
      false,
      undefined,
      (activity) => void kept.push(activity.id),
      (id) => void replaced.push(id),
    )

    expect(state.syncIssues).toEqual([{ code: 'activity-conflict', count: 1 }])
    expect(state.totalActivities).toBe(1)
    // The session still holds the GPX copy: its recording is not dropped, and the FIT one is not kept.
    expect(replaced).toEqual([])
    expect(kept).toEqual([])
    expect(state.result?.activities.map((a) => a.id)).toEqual([`${ride.startMs}-ride.gpx`])
  })

  it('swaps the richer copy in once the server accepts it', async () => {
    const session = new AnalysisSession()
    await session.addFiles([gpx()], SETTINGS, undefined, async () => {})
    const replaced: string[] = []
    const kept: string[] = []
    const state = await session.addFiles(
      [fit()],
      SETTINGS,
      undefined,
      async () => {},
      false,
      undefined,
      (activity) => void kept.push(activity.id),
      (id) => void replaced.push(id),
    )

    expect(state.syncIssues).toEqual([])
    expect(replaced).toHaveLength(1)
    expect(kept).toHaveLength(1)
  })
})
