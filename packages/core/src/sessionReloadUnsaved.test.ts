import { describe, expect, it } from 'vitest'
import { digestActivity } from './digest'
import { encodeFit } from './fit'
import { AnalysisSession, SyncFailure } from './session'
import { DEFAULT_ATHLETE, generateActivity } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const DAY_MS = 24 * 3_600_000

function run(index: number) {
  return generateActivity(
    DEFAULT_ATHLETE,
    {
      id: `run-${index}`,
      name: `Run ${index}`,
      sport: 'run',
      startMs: Date.UTC(2020, 0, 1) + index * DAY_MS,
      durationS: 600,
      effort: 'easy',
      terrain: 'flat',
    },
    index + 1,
  )
}

const fileOf = (index: number) =>
  new File([new Uint8Array(encodeFit(run(index), { gps: true }))], `run-${index}.fit`)

describe('AnalysisSession reloading the library from the server', () => {
  it('keeps an activity whose save failed in the library, still unsaved and retryable', async () => {
    const session = new AnalysisSession()
    const failing = (index: number) => async () => {
      throw new SyncFailure('network', `run ${index} could not be saved`)
    }
    const saved = await session.addFiles([fileOf(0)], SETTINGS, undefined, async () => {})
    expect(saved.totalActivities).toBe(1)
    const unsavedState = await session.addFiles([fileOf(1)], SETTINGS, undefined, failing(1))
    expect(unsavedState.totalActivities).toBe(2)
    expect(unsavedState.syncIssues).toEqual([{ code: 'network', count: 1 }])

    // The server holds only the first activity, as the listing after Update now would show.
    const reloaded = session.loadDigests([digestActivity(run(0))], SETTINGS, { keepUnsaved: true })
    expect(reloaded.totalActivities).toBe(2)
    expect(reloaded.syncIssues).toEqual([{ code: 'network', count: 1 }])

    // Adding the file again saves it, and the issue clears.
    const sunk: string[] = []
    const retried = await session.addFiles([fileOf(1)], SETTINGS, undefined, async (item) => {
      sunk.push(item.digest.id)
    })
    expect(sunk).toHaveLength(1)
    expect(retried.totalActivities).toBe(2)
    expect(retried.syncIssues).toEqual([])
  })

  it('lets the stored copy replace an unsaved one with the same start, and drops its issue', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fileOf(1)], SETTINGS, undefined, async () => {
      throw new SyncFailure('network', 'could not be saved')
    })
    const reloaded = session.loadDigests([digestActivity(run(1))], SETTINGS, { keepUnsaved: true })
    expect(reloaded.totalActivities).toBe(1)
    expect(reloaded.syncIssues).toEqual([])
  })

  it('leaves them out of a library read from this browser, as when a session expired mid-import', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fileOf(1)], SETTINGS, undefined, async () => {
      throw new SyncFailure('signed-out', 'The session ended')
    })
    const device = session.loadDigests([digestActivity(run(0))], SETTINGS)

    expect(device.totalActivities).toBe(1)
    expect(device.result?.activities.map((a) => a.id)).toEqual([run(0).id])
  })
})
