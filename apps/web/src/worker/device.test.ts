import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { digestActivity } from '@rca/core/digest'
import { AnalysisSession, copyOfDigest } from '@rca/core/session'
import type { SyncItem } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import { describe, expect, it, vi } from 'vitest'
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
    copy: copyOfDigest(digest),
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

  it('save does not throw when storage refuses the write, and says it did not keep the activity', async () => {
    const refusing: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      put: () => Promise.reject(new Error('QuotaExceededError')),
    }
    const { actions } = setup(refusing)

    await expect(actions.save(itemFor(FIRST, 'hash-fit'))).resolves.toBe('refused')
  })

  it('save leaves a stored row it cannot read, as a newer version of the app wrote it', async () => {
    const put = vi.fn(() => Promise.resolve())
    const unreadable: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      lookup: async () => 'unreadable',
      put,
    }
    const { actions } = setup(unreadable)

    await expect(actions.save(itemFor(FIRST, 'hash-fit'))).resolves.toBe('newer')
    expect(put).not.toHaveBeenCalled()
  })

  it('save says it kept the activity, and counts a kept copy it prefers as kept', async () => {
    const { actions } = setup()
    const fit = copyFrom(FIRST, 'run.fit')

    await expect(actions.save(itemFor(fit, 'hash-fit'))).resolves.toBe('kept')
    await expect(actions.save(itemFor(copyFrom(FIRST, 'run.gpx'), 'hash-gpx'))).resolves.toBe(
      'kept',
    )
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
      'This activity is no longer kept in this browser.',
    )
  })

  it('forget empties the library and posts an empty list', async () => {
    const { actions, library, posted } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)
    await library.put(workoutKeyOf(SECOND), SECOND)

    await expect(actions.forget()).resolves.toBe(true)

    expect(await library.all()).toEqual([])
    expect(posted).toEqual([{ type: 'libraryActivities', activities: [] }])
  })

  it('forget posts the library that remains, and says so, when storage refuses the clear', async () => {
    const refusing: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      clear: () => Promise.reject(new Error('Device storage failed')),
    }
    const { actions, library, posted } = setup(refusing)
    await library.put(workoutKeyOf(FIRST), FIRST)

    await expect(actions.forget()).resolves.toBe(false)
    expect(posted).toEqual([
      { type: 'libraryActivities', activities: [listed(FIRST)] },
      { type: 'deviceIssue', issue: 'notForgotten' },
    ])
  })

  it('forget counts a refused clear as done when nothing was kept, as when storage cannot be opened', async () => {
    const unopenable: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      clear: () => Promise.reject(new Error('Device storage is unavailable')),
    }
    const { actions, posted } = setup(unopenable)

    await actions.forget()

    expect(posted).toEqual([{ type: 'libraryActivities', activities: [] }])
  })

  it('forget reports a refused clear when the library cannot be read to tell what remains', async () => {
    const unreadable: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      clear: () => Promise.reject(new Error('Device storage failed')),
      allStrict: () => Promise.reject(new Error('Device storage failed')),
    }
    const { actions, posted } = setup(unreadable)

    await actions.forget()

    expect(posted).toEqual([{ type: 'deviceIssue', issue: 'notForgotten' }])
  })

  it('forget tries the clear again when it is called again', async () => {
    const memory = memoryDeviceLibrary()
    let attempts = 0
    const flaky: DeviceLibrary = {
      ...memory,
      clear: () =>
        ++attempts === 1 ? Promise.reject(new Error('Device storage failed')) : memory.clear(),
    }
    const { actions, posted } = setup(flaky)
    await flaky.put(workoutKeyOf(FIRST), FIRST)
    await actions.forget()
    posted.length = 0

    await actions.forget()

    expect(attempts).toBe(2)
    expect(await flaky.all()).toEqual([])
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

describe('device library routes', () => {
  const ROUTE: RouteShape = {
    points: [
      [0, 0],
      [0, 1],
    ],
    aspect: 0.5,
  }

  it('keeps the route of a signed-out import with its digest', async () => {
    const { actions, library } = setup()

    await actions.save({ ...itemFor(FIRST, 'run.fit'), route: ROUTE })

    expect(await library.route(workoutKeyOf(FIRST))).toEqual(ROUTE)
    expect(await actions.route(workoutKeyOf(FIRST))).toEqual(ROUTE)
  })

  it('answers with no route for an activity without one, and after it is removed', async () => {
    const { actions, library } = setup()
    await actions.save({ ...itemFor(FIRST, 'run.fit'), route: ROUTE })
    await actions.save({ ...itemFor(SECOND, 'ride.fit'), route: undefined })

    expect(await actions.route(workoutKeyOf(SECOND))).toBeNull()
    await actions.remove(workoutKeyOf(FIRST), SETTINGS)

    expect(await actions.route(workoutKeyOf(FIRST))).toBeNull()
    expect(await library.route(workoutKeyOf(FIRST))).toBeNull()
  })

  it('answers with no route when storage cannot be read', async () => {
    const broken = memoryDeviceLibrary()
    broken.route = async () => {
      throw new Error('Device storage failed')
    }
    const { actions } = setup(broken)

    await expect(actions.route('run-1')).resolves.toBeNull()
  })
})

describe('dropping a kept copy after a signed-in delete', () => {
  it('removes the copy kept here without reporting the device list, which a signed-in visitor does not see', async () => {
    const { actions, library, posted } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)
    posted.length = 0
    await actions.dropKept(workoutKeyOf(FIRST))
    expect(await library.get(workoutKeyOf(FIRST))).toBeNull()
    expect(posted).toEqual([])
  })

  it('does nothing when no copy is kept here', async () => {
    const { actions, library, posted } = setup()
    await actions.dropKept(workoutKeyOf(FIRST))
    expect(await library.get(workoutKeyOf(FIRST))).toBeNull()
    expect(posted).toEqual([])
  })
})
