import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { digestActivity } from '@rca/core/digest'
import { AnalysisSession, copyOfDigest } from '@rca/core/session'
import type { SyncItem } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import { describe, expect, it, vi } from 'vitest'
import { deviceActions, KEPT_NOT_READ_FOR_REMOVE, workoutKeyOf } from './device'
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

  describe('when the kept library cannot be read', () => {
    /** A library whose reads fail on an open database. */
    function unreadable(): DeviceLibrary {
      const library = memoryDeviceLibrary()
      return {
        ...library,
        all: async () => {
          throw new Error('Connection to Indexed Database server lost')
        },
        lookup: async () => {
          throw new Error('Connection to Indexed Database server lost')
        },
      }
    }

    it('load rejects instead of loading an empty library, and does not post an empty list', async () => {
      const { actions, posted } = setup(unreadable())

      await expect(actions.load(SETTINGS)).rejects.toThrow(/could not be read/)

      expect(posted).toEqual([])
      expect(actions.inSession()).toBe(false)
    })

    it('load reads again once, so a connection the browser dropped does not fail it', async () => {
      const library = memoryDeviceLibrary()
      await library.put(workoutKeyOf(FIRST), FIRST)
      let reads = 0
      const flaky: DeviceLibrary = {
        ...library,
        all: () => (++reads === 1 ? Promise.reject(new Error('Connection lost')) : library.all()),
      }
      const { actions } = setup(flaky)

      const state = await actions.load(SETTINGS)

      expect(reads).toBe(2)
      expect(state.totalActivities).toBe(1)
    })

    it('load says what the caller gave it when the second read fails too', async () => {
      const { actions } = setup(unreadable())
      await expect(actions.load(SETTINGS, 'Add them again.')).rejects.toThrow('Add them again.')
    })

    it('save is refused rather than written over a copy that could not be looked up', async () => {
      const put = vi.fn()
      const { actions } = setup({ ...unreadable(), put })
      expect(await actions.save(itemFor(FIRST, 'a'))).toBe('refused')
      expect(put).not.toHaveBeenCalled()
    })
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

  it('save leaves a stored row that a newer version of the app wrote', async () => {
    const put = vi.fn(() => Promise.resolve())
    const newer: DeviceLibrary = { ...memoryDeviceLibrary(), lookup: async () => 'newer', put }
    const { actions } = setup(newer)

    await expect(actions.save(itemFor(FIRST, 'hash-fit'))).resolves.toBe('newer')
    expect(put).not.toHaveBeenCalled()
  })

  it('save writes over a stored row that is damaged or from an older format, so it heals', async () => {
    const put = vi.fn(() => Promise.resolve())
    const damaged: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      lookup: async () => 'unreadable',
      put,
    }
    const { actions } = setup(damaged)

    await expect(actions.save(itemFor(FIRST, 'hash-fit'))).resolves.toBe('kept')
    expect(put).toHaveBeenCalledOnce()
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
      all: () => Promise.reject(new Error('Device storage failed')),
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
  it('removes the copy kept here without reporting the device list, only whether it still holds anything', async () => {
    const { actions, library, posted } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)
    await library.put(workoutKeyOf(SECOND), SECOND)
    posted.length = 0
    await actions.dropKept(workoutKeyOf(FIRST))
    expect(await library.get(workoutKeyOf(FIRST))).toBeNull()
    expect(posted).toEqual([{ type: 'deviceHolds', holds: true }])

    await actions.dropKept(workoutKeyOf(SECOND))
    expect(posted.at(-1)).toEqual({ type: 'deviceHolds', holds: false })
  })

  it('counts rows it keeps but cannot read as the library still holding something', async () => {
    const library: DeviceLibrary = { ...memoryDeviceLibrary(), skipped: () => 1 }
    await library.put(workoutKeyOf(FIRST), FIRST)
    const { actions, posted } = setup(library)
    await actions.dropKept(workoutKeyOf(FIRST))
    expect(posted).toEqual([{ type: 'deviceHolds', holds: true }])
  })

  it('removes a row this version cannot read too, which the lookup names rather than hides', async () => {
    const library: DeviceLibrary = { ...memoryDeviceLibrary(), lookup: async () => 'newer' }
    const remove = vi.spyOn(library, 'remove')
    const { actions } = setup(library)
    await actions.dropKept(workoutKeyOf(FIRST))
    expect(remove).toHaveBeenCalledWith(workoutKeyOf(FIRST))
  })

  it('does nothing when no copy is kept here', async () => {
    const { actions, library, posted } = setup()
    await actions.dropKept(workoutKeyOf(FIRST))
    expect(await library.get(workoutKeyOf(FIRST))).toBeNull()
    expect(posted).toEqual([])
  })
})

describe('when the library kept in this browser did not open', () => {
  /** A library whose database failed to open: every read rejects, as the real one does. */
  function notOpen(): DeviceLibrary {
    const failed = () => Promise.reject(new Error('Device storage did not open: Storage is full'))
    return {
      ...memoryDeviceLibrary(),
      all: failed,
      get: failed,
      lookup: failed,
      route: failed,
      put: failed,
      remove: failed,
      clear: failed,
    }
  }

  it('dropKept rejects, so a signed-in delete never claims the copy kept here is gone', async () => {
    const { actions } = setup(notOpen())
    await expect(actions.dropKept(workoutKeyOf(FIRST))).rejects.toThrow('did not open')
  })

  it('a read that fails in passing is not taken for no copy: dropKept and remove both refuse', async () => {
    // get answers none on a refused transaction, as it does; the strict lookup is what decides.
    const flaky: DeviceLibrary = {
      ...memoryDeviceLibrary(),
      get: async () => null,
      lookup: () => Promise.reject(new Error('Transactions are refused')),
    }
    const { actions } = setup(flaky)
    await expect(actions.dropKept(workoutKeyOf(FIRST))).rejects.toThrow('Transactions are refused')
    await expect(actions.remove(workoutKeyOf(FIRST), SETTINGS)).rejects.toThrow(
      KEPT_NOT_READ_FOR_REMOVE,
    )
  })

  it('remove names the real cause, not that the activity is no longer kept', async () => {
    const { actions } = setup(notOpen())
    await expect(actions.remove(workoutKeyOf(FIRST), SETTINGS)).rejects.toThrow(
      KEPT_NOT_READ_FOR_REMOVE,
    )
  })
})

describe('the rows a library keeps but cannot read', () => {
  it('are counted in the list posted to the page, and left out of it when there are none', async () => {
    const library: DeviceLibrary = { ...memoryDeviceLibrary(), skipped: () => 2 }
    const { actions, posted } = setup(library)

    await actions.load(SETTINGS)
    expect(posted).toEqual([{ type: 'libraryActivities', activities: [], skipped: 2 }])

    posted.length = 0
    const { actions: plain, posted: plainPosted } = setup()
    await plain.load(SETTINGS)
    expect(plainPosted).toEqual([{ type: 'libraryActivities', activities: [] }])
  })
})

describe('the file kept with a saved workout', () => {
  const HASH = 'c'.repeat(64)
  const fileItem = (digest: ActivityDigest, fileHash = HASH): SyncItem => ({
    digest,
    fileName: 'run.fit',
    fileHash,
    bytes: new Uint8Array(),
  })

  it('keeps the file name and hash with the digest', async () => {
    const { actions, library } = setup()

    await actions.save(fileItem(FIRST))

    expect(await library.all()).toEqual([
      {
        workoutKey: workoutKeyOf(FIRST),
        digest: FIRST,
        file: { fileName: 'run.fit', fileHash: HASH },
      },
    ])
  })

  it('keeps no file when the hash is missing, as in a browser with no crypto', async () => {
    const { actions, library } = setup()

    await actions.save(fileItem(FIRST, ''))

    expect((await library.all())[0]?.file).toBeUndefined()
  })

  it('gives a row kept before files were recorded its hash when the same file is added again', async () => {
    const { actions, library } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)

    await actions.save(fileItem(FIRST))

    expect((await library.all())[0]?.file).toEqual({ fileName: 'run.fit', fileHash: HASH })
  })

  it('does not give it the hash of a different copy of the workout', async () => {
    const { actions, library } = setup()
    const kept = copyFrom(FIRST, 'run.fit')
    await library.put(workoutKeyOf(FIRST), kept)

    // A poorer copy: it is not kept, and its hash is not the kept copy's.
    await actions.save(fileItem(copyFrom(FIRST, 'run.gpx')))

    expect((await library.all())[0]?.file).toBeUndefined()
  })
})

describe('a library emptied under a session', () => {
  it('refuses the writes of a session that loaded it before another tab emptied it', async () => {
    const { actions, library } = setup()
    await library.put(workoutKeyOf(FIRST), FIRST)
    await actions.load(SETTINGS)
    // Another tab chooses Remove all.
    await library.clear()

    expect(await actions.save(itemFor(SECOND, 'h2'))).toBe('replaced')

    expect(await library.all()).toEqual([])
    expect(await actions.current()).toBe(false)
  })

  it('writes again after it is told to load the library again', async () => {
    const { actions, library } = setup()
    await actions.load(SETTINGS)
    await library.clear()
    expect(await actions.save(itemFor(FIRST, 'h1'))).toBe('replaced')

    actions.replaced()
    await actions.load(SETTINGS)

    expect(await actions.save(itemFor(FIRST, 'h1'))).toBe('kept')
    expect(await actions.current()).toBe(true)
  })

  it('takes the epoch a session finds at its first write when it never loaded the library', async () => {
    const { actions, library } = setup()
    await library.clear()
    await library.clear()

    expect(await actions.save(itemFor(FIRST, 'h1'))).toBe('kept')
    await library.clear()
    expect(await actions.save(itemFor(SECOND, 'h2'))).toBe('replaced')
  })

  it('writes to the library it emptied itself, in the epoch that began', async () => {
    const { actions, library } = setup()
    await actions.load(SETTINGS)
    await actions.forget()

    expect(await actions.save(itemFor(FIRST, 'h1'))).toBe('kept')
    expect((await library.all()).length).toBe(1)
  })
})

describe('a library whose epoch cannot be read', () => {
  const unreadable = (library: DeviceLibrary): DeviceLibrary => ({
    ...library,
    epoch: async () => {
      throw new Error('Device storage failed')
    },
  })

  it('is not loaded, since it could not be written to safely', async () => {
    const { actions } = setup(unreadable(memoryDeviceLibrary()))
    await expect(actions.load(SETTINGS)).rejects.toThrow(/could not be read/)
  })

  it('is not taken for unchanged: the import is stopped, not trusted', async () => {
    const library = memoryDeviceLibrary()
    const { actions } = setup(library)
    await actions.load(SETTINGS)
    const failing = unreadable(library)
    // The same session, now with storage that will not answer.
    const { actions: afterwards } = setup(failing)
    expect(await afterwards.current()).toBe(true)
    await expect(afterwards.save(itemFor(FIRST, 'h1'))).resolves.toBe('refused')
    // A session that had loaded it at an epoch asks again and gets no answer.
    const flaky: DeviceLibrary = {
      ...library,
      epoch: vi.fn().mockResolvedValueOnce(0).mockRejectedValue(new Error('x')),
    }
    const { actions: loaded } = setup(flaky)
    await loaded.load(SETTINGS)
    expect(await loaded.current()).toBe(false)
  })

  it('refuses the write of a session that never loaded it', async () => {
    const { actions, library } = setup(unreadable(memoryDeviceLibrary()))
    expect(await actions.save(itemFor(FIRST, 'h1'))).toBe('refused')
    expect(await library.all()).toEqual([])
  })
})

describe('results that show but could not be kept', () => {
  it('are remembered until the library is loaded again, so a reload does not drop them', async () => {
    const { actions, library } = setup({
      ...memoryDeviceLibrary(),
      put: async () => {
        throw new Error('full')
      },
    })
    await actions.load(SETTINGS)
    expect(actions.hasUnkept()).toBe(false)

    expect(await actions.save(itemFor(FIRST, 'h1'))).toBe('refused')
    expect(actions.hasUnkept()).toBe(true)

    actions.replaced()
    expect(actions.hasUnkept()).toBe(false)
    expect(await library.all()).toEqual([])
  })
})

describe('what is told when the library’s epoch is read', () => {
  it('is told on loading, at a first write, and after a Remove all', async () => {
    const told = vi.fn(async () => undefined)
    const posted: WorkerResponse[] = []
    const actions = deviceActions(
      new AnalysisSession(),
      memoryDeviceLibrary(),
      (message) => posted.push(message),
      async () => true,
      told,
    )
    await actions.load(SETTINGS)
    expect(told).toHaveBeenCalledTimes(1)
    actions.replaced()
    await actions.save(itemFor(FIRST, 'h1'))
    expect(told).toHaveBeenCalledTimes(2)
    await actions.forget()
    expect(told).toHaveBeenCalledTimes(3)
  })
})
