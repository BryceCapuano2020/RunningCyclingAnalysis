import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { digestActivity } from '@rca/core/digest'
import { AnalysisSession } from '@rca/core/session'
import type { SyncItem } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import { describe, expect, it } from 'vitest'
import { deviceActions, workoutKeyOf } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import { memoryDeviceLibrary } from '../test/deviceLibrary.fake'
import type { SavedActivity, WorkerResponse } from './protocol'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const [firstActivity, secondActivity] = sampleDataset().activities
if (firstActivity === undefined || secondActivity === undefined) {
  throw new Error('The sample has fewer than two activities')
}
const FIRST = digestActivity(firstActivity)
const SECOND = digestActivity(secondActivity)
const NEWEST_FIRST = [FIRST, SECOND].sort((a, b) => b.startMs - a.startMs)

/** The same workout as a copy read from a file of the given name, whose extension sets its rank. */
function copyFrom(digest: ActivityDigest, fileName: string): ActivityDigest {
  return { ...digest, id: `${digest.startMs}-${fileName}` }
}

function listed(digest: ActivityDigest): SavedActivity {
  return {
    id: workoutKeyOf(digest),
    name: digest.name,
    startMs: digest.startMs,
    sport: digest.sport,
  }
}

function itemFor(digest: ActivityDigest, fileHash: string): SyncItem {
  return { digest, fileName: 'run.fit', fileHash, bytes: new Uint8Array() }
}

function setup(library: DeviceLibrary = memoryDeviceLibrary()) {
  const posted: WorkerResponse[] = []
  const session = new AnalysisSession()
  const actions = deviceActions(session, library, (message) => {
    posted.push(message)
  })
  return { actions, library, posted }
}

describe('device library actions', () => {
  it('load posts one entry per workout, newest first', async () => {
    const { actions, library, posted } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)
    await library.put(workoutKeyOf(SECOND), SECOND)

    const state = await actions.load(SETTINGS)

    expect(posted).toEqual([{ type: 'libraryActivities', activities: NEWEST_FIRST.map(listed) }])
    expect(state.totalActivities).toBe(2)
  })

  it('save keeps the digest for a later load', async () => {
    const { actions, posted } = setup()

    await actions.save(itemFor(FIRST, 'hash-fit'))
    await actions.report()

    expect(posted).toEqual([{ type: 'libraryActivities', activities: [listed(FIRST)] }])
  })

  it('save does not throw when storage refuses the write', async () => {
    const refusing: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      put: () => Promise.reject(new Error('QuotaExceededError')),
    }
    const { actions } = setup(refusing)

    await expect(actions.save(itemFor(FIRST, 'hash-fit'))).resolves.toBeUndefined()
  })

  it('keeps a richer FIT copy over a GPX copy of the same workout, and a poorer copy does not replace it', async () => {
    const { actions, library } = setup()
    const gpx = copyFrom(FIRST, 'run.gpx')
    const fit = copyFrom(FIRST, 'run.fit')

    await actions.save(itemFor(gpx, 'hash-gpx'))
    await actions.save(itemFor(fit, 'hash-fit'))
    expect(await library.get(workoutKeyOf(FIRST))).toEqual(fit)

    await actions.save(itemFor(copyFrom(FIRST, 'again.gpx'), 'hash-gpx-again'))
    expect(await library.all()).toEqual([{ workoutKey: workoutKeyOf(FIRST), digest: fit }])

    await actions.load(SETTINGS)
    expect(await library.all()).toEqual([{ workoutKey: workoutKeyOf(FIRST), digest: fit }])
  })

  it('replaces a copy from an older analysis model when the workout is imported again', async () => {
    const { actions, library } = setup()
    const key = workoutKeyOf(FIRST)
    await library.put(key, { ...FIRST, modelRevision: MODEL_REVISION - 1 })

    await actions.save(itemFor(FIRST, 'hash-fit'))

    expect(await library.get(key)).toEqual(FIRST)
  })

  it('never replaces a copy a newer version of the app wrote', async () => {
    const { actions, library } = setup()
    const key = workoutKeyOf(FIRST)
    const newer = { ...FIRST, modelRevision: MODEL_REVISION + 1 }
    await library.put(key, newer)

    await actions.save(itemFor(FIRST, 'hash-fit'))

    expect(await library.get(key)).toEqual(newer)
  })

  it('remove deletes the workout, posts the new list, and updates the session', async () => {
    const { actions, library, posted } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)
    await library.put(workoutKeyOf(SECOND), SECOND)
    await actions.load(SETTINGS)

    const state = await actions.remove(workoutKeyOf(FIRST), SETTINGS)

    expect(await library.all()).toEqual([{ workoutKey: workoutKeyOf(SECOND), digest: SECOND }])
    expect(posted.at(-1)).toEqual({ type: 'libraryActivities', activities: [listed(SECOND)] })
    expect(state.totalActivities).toBe(1)
  })

  it('remove throws for a workout that is not kept on this device', async () => {
    const { actions } = setup()

    await expect(actions.remove(workoutKeyOf(FIRST), SETTINGS)).rejects.toThrow(
      'This activity is no longer kept on this device.',
    )
  })

  it('forget empties the library and posts an empty list', async () => {
    const { actions, library, posted } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)
    await library.put(workoutKeyOf(SECOND), SECOND)

    await actions.forget()

    expect(await library.all()).toEqual([])
    expect(posted).toEqual([{ type: 'libraryActivities', activities: [] }])
  })

  it('forget still posts an empty list when storage refuses the clear', async () => {
    const refusing: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      clear: () => Promise.reject(new Error('Device storage failed')),
    }
    const { actions, posted } = setup(refusing)

    await expect(actions.forget()).resolves.toBeUndefined()
    expect(posted).toEqual([{ type: 'libraryActivities', activities: [] }])
  })

  it('report posts nothing when the library cannot be read, and does not throw', async () => {
    const unreadable: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      all: () => Promise.reject(new Error('Device storage failed')),
    }
    const { actions, posted } = setup(unreadable)

    await expect(actions.report()).resolves.toBeUndefined()
    expect(posted).toEqual([])
  })
})
