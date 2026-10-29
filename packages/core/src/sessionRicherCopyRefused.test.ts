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

  it('still swaps the richer copy in when the save fails for another reason, and retries it later', async () => {
    const session = new AnalysisSession()
    await session.addFiles([gpx()], SETTINGS, undefined, async () => {})
    const replaced: string[] = []
    const kept: string[] = []
    const state = await session.addFiles(
      [fit()],
      SETTINGS,
      undefined,
      async () => {
        throw new SyncFailure('network', 'The connection dropped')
      },
      false,
      undefined,
      (activity) => void kept.push(activity.id),
      (id) => void replaced.push(id),
    )

    expect(state.syncIssues).toEqual([{ code: 'network', count: 1 }])
    expect(state.result?.activities.map((a) => a.id)).toEqual([`${ride.startMs}-ride.fit`])
    expect(replaced).toEqual([`${ride.startMs}-ride.gpx`])
    expect(kept).toEqual([`${ride.startMs}-ride.fit`])
  })

  it('swaps the richer copy in at once after saving has stopped, since nothing is sent', async () => {
    const session = new AnalysisSession()
    await session.addFiles([gpx()], SETTINGS, undefined, async () => {})
    const earlier = generateActivity(
      DEFAULT_ATHLETE,
      {
        id: 'ride-0',
        name: 'Ride 0',
        sport: 'ride',
        startMs: Date.UTC(2019, 11, 1, 8),
        durationS: 900,
        effort: 'easy',
        terrain: 'flat',
      },
      2,
    )
    const stopper = new File([new Uint8Array(encodeFit(earlier, { gps: true }))], 'earlier.fit')
    const replaced: string[] = []
    const sent: string[] = []
    const state = await session.addFiles(
      [stopper, fit()],
      SETTINGS,
      undefined,
      async (item) => {
        sent.push(item.fileName)
        throw new SyncFailure('signed-out', 'The session ended')
      },
      false,
      undefined,
      undefined,
      (id) => void replaced.push(id),
    )

    expect(sent).toEqual(['earlier.fit'])
    expect(replaced).toEqual([`${ride.startMs}-ride.gpx`])
    expect(state.result?.activities.map((a) => a.id)).toContain(`${ride.startMs}-ride.fit`)
    expect(state.syncIssues).toEqual([{ code: 'signed-out', count: 2 }])
  })

  it('keeps the first copy of one import when the server refuses the richer second one', async () => {
    const session = new AnalysisSession()
    let completed: { added: { id: string }[] } | undefined
    const state = await session.addFiles(
      [gpx(), fit()],
      SETTINGS,
      undefined,
      async (item) => {
        if (item.fileName === 'ride.fit') throw new SyncFailure('activity-conflict', 'refused')
      },
      false,
      (outcome) => void (completed = outcome),
    )

    expect(state.result?.activities.map((a) => a.id)).toEqual([`${ride.startMs}-ride.gpx`])
    expect(state.syncIssues).toEqual([{ code: 'activity-conflict', count: 1 }])
    expect(completed?.added.map((digest) => digest.id)).toEqual([`${ride.startMs}-ride.gpx`])
  })
})
