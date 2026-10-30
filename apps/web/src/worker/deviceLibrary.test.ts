import { DIGEST_VERSION, digestActivity, serializeDigest } from '@rca/core/digest'
import type { RouteShape } from '@rca/core/route/routeShape'
import { sampleDataset } from '@rca/core/synthetic'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { deviceActions, KEPT_NOT_READ } from './device'
import { deviceFileOf } from './deviceFile'
import { OPEN_TIMEOUT_MS, openDeviceLibrary } from './deviceLibrary'
import type { WorkerResponse } from './protocol'

const [activity] = sampleDataset().activities
if (activity === undefined) throw new Error('The sample has no activities')
const MEASURED = digestActivity(activity)

interface FakeOptions {
  /**
   * `throw`: opening throws. `error`: the open request fails. `no-storage`: it fails as a private window
   * does. `hang`: it never answers. `blocked`: another tab blocks it, then it answers late.
   */
  open?: 'throw' | 'error' | 'no-storage' | 'hang' | 'blocked'
  /** Starting a transaction throws. */
  transaction?: boolean
  /** Clearing the store throws. */
  clear?: boolean
}

/** A request that settles on a later turn, as IndexedDB requests do. */
function settleLater<T>(work: () => T, hooks: RequestHooks = NO_HOOKS) {
  const pending: { result?: T; error?: Error; onsuccess?: () => void; onerror?: () => void } = {}
  hooks.started()
  setTimeout(() => {
    try {
      pending.result = work()
      pending.onsuccess?.()
    } catch (error) {
      pending.error = error instanceof Error ? error : new Error(String(error))
      pending.onerror?.()
    }
    hooks.settled()
  }, 0)
  return pending
}

/** What a transaction hears of its requests, so it completes only once they have all settled. */
interface RequestHooks {
  started: () => void
  settled: () => void
}
const NO_HOOKS: RequestHooks = { started: () => undefined, settled: () => undefined }

function storeIn(rows: Map<string, unknown>, options: FakeOptions, hooks: RequestHooks) {
  const sortedKeys = () => [...rows.keys()].sort()
  return {
    getAllKeys: () => settleLater(sortedKeys, hooks),
    getAll: () => settleLater(() => sortedKeys().map((key) => rows.get(key)), hooks),
    get: (key: string) => settleLater(() => rows.get(key), hooks),
    put: (value: unknown, key: string) => {
      rows.set(key, value)
      return settleLater(() => key, hooks)
    },
    delete: (key: string) => {
      rows.delete(key)
      return settleLater(() => undefined, hooks)
    },
    clear: () => {
      if (options.clear) throw new Error('Clearing is refused')
      rows.clear()
      return settleLater(() => undefined, hooks)
    },
  }
}

interface FakeConnection {
  closeCalls: number
  onclose: (() => void) | null
  onversionchange: (() => void) | null
  close: () => void
  createObjectStore: (name: string) => void
  transaction: (name: string, mode: IDBTransactionMode) => FakeTransaction
}

interface FakeTransaction {
  oncomplete: (() => void) | null
  objectStore: (name: string) => ReturnType<typeof storeIn>
}

/**
 * IndexedDB with one database and one object store, for the device library. Each open is a new
 * connection, which the test can end the way the browser or another tab does.
 */
function fakeIndexedDb(options: FakeOptions = {}) {
  const rows = new Map<string, unknown>()
  const connections: FakeConnection[] = []
  let storeCreated = false

  function connect(): FakeConnection {
    const connection: FakeConnection = {
      closeCalls: 0,
      onclose: null,
      onversionchange: null,
      close: () => {
        connection.closeCalls += 1
      },
      createObjectStore: () => undefined,
      transaction: () => {
        if (options.transaction) throw new Error('Transactions are refused')
        // Like IndexedDB, a transaction completes once its requests have settled and no new one follows.
        let timer: ReturnType<typeof setTimeout> | undefined
        const finish = () => {
          clearTimeout(timer)
          timer = setTimeout(() => transaction.oncomplete?.(), 0)
        }
        const store = storeIn(rows, options, {
          started: () => clearTimeout(timer),
          settled: finish,
        })
        const transaction: FakeTransaction = { oncomplete: null, objectStore: () => store }
        finish()
        return transaction
      },
    }
    connections.push(connection)
    return connection
  }

  const indexedDB = {
    open: () => {
      if (options.open === 'throw') throw new Error('Storage is disabled')
      const pending: {
        result?: FakeConnection
        error?: Error
        onsuccess?: () => void
        onerror?: () => void
        onblocked?: () => void
        onupgradeneeded?: () => void
      } = {}
      if (options.open === 'hang') return pending
      setTimeout(() => {
        if (options.open === 'error' || options.open === 'no-storage') {
          pending.error = new Error('Storage is full')
          if (options.open === 'no-storage') pending.error.name = 'InvalidStateError'
          pending.onerror?.()
          return
        }
        if (options.open === 'blocked') pending.onblocked?.()
        pending.result = connect()
        if (!storeCreated) {
          storeCreated = true
          pending.onupgradeneeded?.()
        }
        pending.onsuccess?.()
      }, 0)
      return pending
    },
  }

  return {
    indexedDB,
    rows,
    openCount: () => connections.length,
    closed: () => connections.filter((connection) => connection.closeCalls > 0).length,
    endConnection(event: 'close' | 'versionchange') {
      const connection = connections.at(-1)
      if (connection === undefined) throw new Error('Nothing is open')
      if (event === 'close') connection.onclose?.()
      else connection.onversionchange?.()
    },
  }
}

/** Storage that cannot be used, and what the library must do about it. */
const REFUSED: [string, FakeOptions][] = [
  ['throws when opened', { open: 'throw' }],
  ['fails to open', { open: 'error' }],
  ['refuses transactions', { transaction: true }],
]

/** Storage this browser does not offer: nothing could have been kept there, so it lists as empty. */
const NOT_OFFERED: [string, FakeOptions][] = [
  ['throws when opened', { open: 'throw' }],
  ['refuses as a private window does', { open: 'no-storage' }],
]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('device library without IndexedDB', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined)
  })

  it('reads as empty, and refuses writes', async () => {
    const library = openDeviceLibrary()

    await expect(library.all()).resolves.toEqual([])
    await expect(library.get('run-1')).resolves.toBeNull()
    await expect(library.put('run-1', MEASURED)).rejects.toThrow('Device storage is unavailable')
    await expect(library.remove('run-1')).rejects.toThrow('Device storage is unavailable')
    await expect(library.clear()).rejects.toThrow('Device storage is unavailable')
  })
})

describe('device library in IndexedDB', () => {
  it('keeps a digest until it is removed', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()

    await library.put('run-1', MEASURED)
    expect(await library.get('run-1')).toEqual(MEASURED)
    expect(await library.all()).toEqual([{ workoutKey: 'run-1', digest: MEASURED }])

    await library.remove('run-1')
    expect(await library.get('run-1')).toBeNull()
    expect(await library.all()).toEqual([])
  })

  describe('the file a row was made from', () => {
    const HASH = 'a'.repeat(64)
    const OTHER_HASH = 'b'.repeat(64)
    const FILE = { fileName: 'run.fit', fileHash: HASH }

    it('keeps the file name and hash beside the digest, and lists them', async () => {
      vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
      const library = openDeviceLibrary()

      await library.put('run-1', MEASURED, null, FILE)

      expect(await library.all()).toEqual([{ workoutKey: 'run-1', digest: MEASURED, file: FILE }])
    })

    it('keeps no file for a row put without one, or with something that is not a hash', async () => {
      vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
      const library = openDeviceLibrary()

      await library.put('run-1', MEASURED)
      expect(await library.all()).toEqual([{ workoutKey: 'run-1', digest: MEASURED }])
      expect(deviceFileOf({ fileName: 'run.fit', fileHash: '' })).toBeNull()
      expect(deviceFileOf({ fileName: 'run.fit', fileHash: 'ABC' })).toBeNull()
      expect(deviceFileOf({ fileName: '', fileHash: HASH })).toBeNull()
      expect(deviceFileOf(FILE)).toEqual(FILE)
    })

    it('reads a row written before files were recorded, as a digest and no file', async () => {
      const fake = fakeIndexedDb()
      vi.stubGlobal('indexedDB', fake.indexedDB)
      fake.rows.set('run-1', { digest: serializeDigest(MEASURED), route: null })
      fake.rows.set('run-2', serializeDigest(MEASURED))

      const entries = await openDeviceLibrary().all()

      expect(entries.map((entry) => [entry.workoutKey, entry.file])).toEqual([
        ['run-1', undefined],
        ['run-2', undefined],
      ])
    })

    it('gives a row with no hash the file, and keeps its digest and route', async () => {
      const fake = fakeIndexedDb()
      vi.stubGlobal('indexedDB', fake.indexedDB)
      const library = openDeviceLibrary()
      const route: RouteShape = {
        points: [
          [0, 0],
          [1, 0.5],
        ],
        aspect: 2,
      }
      await library.put('run-1', MEASURED, route)
      fake.rows.set('run-2', serializeDigest(MEASURED))

      await library.backfillFile('run-1', FILE)
      await library.backfillFile('run-2', FILE)

      expect(await library.route('run-1')).toEqual(route)
      const entries = await library.all()
      expect(entries.map((entry) => entry.file)).toEqual([FILE, FILE])
      expect(entries[0]?.digest).toEqual(MEASURED)
      expect(fake.rows.get('run-1')).toMatchObject({ route })
    })

    it('leaves a row that has a hash alone, and does nothing for a workout kept nowhere', async () => {
      vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
      const library = openDeviceLibrary()
      await library.put('run-1', MEASURED, null, FILE)

      await library.backfillFile('run-1', { fileName: 'other.fit', fileHash: OTHER_HASH })
      await library.backfillFile('run-9', FILE)

      expect((await library.all()).map((entry) => entry.file)).toEqual([FILE])
    })
  })

  it('keeps a digest with NaN best efforts, as the analysis writes it', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    const library = openDeviceLibrary()

    await library.put('run-1', MEASURED)

    expect(await library.get('run-1')).toEqual(MEASURED)
  })

  it('lists entries in key order, and clear empties the store', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-2', MEASURED)
    await library.put('run-1', MEASURED)

    expect((await library.all()).map((entry) => entry.workoutKey)).toEqual(['run-1', 'run-2'])

    await library.clear()
    expect(await library.all()).toEqual([])
  })

  it('skips stored rows that do not read as digests, and keeps them for a newer build', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)
    fake.rows.set('ride-2', { not: 'a digest' })

    expect(await library.all()).toEqual([{ workoutKey: 'run-1', digest: MEASURED }])
    expect([...fake.rows.keys()].sort()).toEqual(['ride-2', 'run-1'])
  })

  it('tells a newer version’s row, a damaged one and no row apart', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)
    fake.rows.set('ride-2', { not: 'a digest' })

    expect(await library.lookup('run-1')).toEqual(MEASURED)
    expect(await library.lookup('ride-2')).toBe('unreadable')
    // Damaged, or from an older format: not a newer version's, so it may be written over.
    fake.rows.set('ride-3', 'not json')
    fake.rows.set('ride-4', { digest: JSON.stringify({ version: 0 }) })
    expect(await library.lookup('ride-3')).toBe('unreadable')
    expect(await library.lookup('ride-4')).toBe('unreadable')
    // A digest in a later format, bare or in a row with its route, belongs to a newer build.
    const later = JSON.stringify({
      ...JSON.parse(serializeDigest(MEASURED)),
      version: DIGEST_VERSION + 1,
    })
    fake.rows.set('ride-5', later)
    fake.rows.set('ride-6', { digest: later, route: null })
    expect(await library.lookup('ride-5')).toBe('newer')
    expect(await library.lookup('ride-6')).toBe('newer')
    expect(await library.get('ride-2')).toBeNull()
    expect(await library.lookup('swim-3')).toBeNull()
  })

  it('reopens the database after the browser closes it', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)

    fake.endConnection('close')

    expect(await library.get('run-1')).toEqual(MEASURED)
    expect(fake.openCount()).toBe(2)
  })

  it('reopens the database after another tab upgrades it', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)

    fake.endConnection('versionchange')

    expect(await library.all()).toEqual([{ workoutKey: 'run-1', digest: MEASURED }])
    expect(fake.openCount()).toBe(2)
  })

  it.each(REFUSED)('refuses writes when storage %s', async (_, options) => {
    vi.stubGlobal('indexedDB', fakeIndexedDb(options).indexedDB)
    const library = openDeviceLibrary()

    await expect(library.put('run-1', MEASURED)).rejects.toThrow()
    await expect(library.remove('run-1')).rejects.toThrow()
    await expect(library.clear()).rejects.toThrow()
  })

  it('reads a single workout as none when a transaction is refused, but not when the database failed to open', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ transaction: true }).indexedDB)
    await expect(openDeviceLibrary().get('run-1')).resolves.toBeNull()

    vi.stubGlobal('indexedDB', fakeIndexedDb({ open: 'error' }).indexedDB)
    await expect(openDeviceLibrary().get('run-1')).rejects.toThrow('Device storage did not open')
    // A route is read the same way, so it is not taken for none either; the caller treats it as best effort.
    await expect(openDeviceLibrary().route('run-1')).rejects.toThrow('Device storage did not open')
  })

  it('reads a workout as none when the browser offers no storage, since nothing could be kept', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ open: 'no-storage' }).indexedDB)
    await expect(openDeviceLibrary().get('run-1')).resolves.toBeNull()
  })

  it('counts the rows it keeps but cannot read, so a listing of none is not always an empty library', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)
    fake.rows.set('run-2', JSON.stringify({ version: DIGEST_VERSION + 1 }))
    fake.rows.set('run-3', 'not json')

    expect(await library.all()).toHaveLength(1)
    expect(library.skipped()).toBe(2)
    fake.rows.clear()
    expect(await library.all()).toEqual([])
    expect(library.skipped()).toBe(0)
  })

  it('lists what is kept', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)
    await expect(library.all()).resolves.toHaveLength(1)
  })

  it.each(NOT_OFFERED)('lists nothing when storage is not offered: it %s', async (_, options) => {
    vi.stubGlobal('indexedDB', fakeIndexedDb(options).indexedDB)
    await expect(openDeviceLibrary().all()).resolves.toEqual([])
  })

  it('rejects a listing and a lookup when the database failed to open, so rows that may be there are not read as none', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ open: 'error' }).indexedDB)
    const library = openDeviceLibrary()

    await expect(library.all()).rejects.toThrow('Device storage did not open')
    await expect(library.lookup('run-1')).rejects.toThrow('Device storage did not open')
    await expect(library.get('run-1')).rejects.toThrow('Device storage did not open')
  })

  it('gives up on an open that never answers, and opens again on the next call', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', fakeIndexedDb({ open: 'hang' }).indexedDB)
    const library = openDeviceLibrary()
    const settled = expect(library.all()).rejects.toThrow('did not open in time')
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS)
    await settled
    vi.useRealTimers()

    // Not remembered as failed for good: the next call tries the open once more.
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    await expect(library.all()).resolves.toEqual([])
  })

  it('treats a database blocked by another tab as failed, and closes it if it opens late', async () => {
    const fake = fakeIndexedDb({ open: 'blocked' })
    vi.stubGlobal('indexedDB', fake.indexedDB)

    await expect(openDeviceLibrary().all()).rejects.toThrow('blocked by another tab')
    // The open still answers after the block clears; nobody will use that connection.
    await vi.waitFor(() => expect(fake.closed()).toBe(1))
  })

  it('refuses a clear and a removal on a database that failed to open', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ open: 'error' }).indexedDB)
    const library = openDeviceLibrary()

    await expect(library.clear()).rejects.toThrow('Device storage did not open')
    await expect(library.remove('run-1')).rejects.toThrow('Device storage did not open')
  })

  it('rejects a listing that fails on a database that opened, while a single read gives nothing', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ transaction: true }).indexedDB)
    const library = openDeviceLibrary()

    await expect(library.get('run-1')).resolves.toBeNull()
    await expect(library.all()).rejects.toThrow('Transactions are refused')
  })

  it('rejects a lookup that fails on a database that opened, so it is not taken for no kept copy', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ transaction: true }).indexedDB)
    const library = openDeviceLibrary()

    await expect(library.lookup('run-1')).rejects.toThrow('Transactions are refused')
    await expect(library.get('run-1')).resolves.toBeNull()
  })

  it('keeps the stored digests when a clear is refused', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ clear: true }).indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)

    await expect(library.clear()).rejects.toThrow('Clearing is refused')
    expect(await library.get('run-1')).toEqual(MEASURED)
  })
})

describe('a database that will not open, seen by the page', () => {
  function actionsOn(options: FakeOptions) {
    vi.stubGlobal('indexedDB', fakeIndexedDb(options).indexedDB)
    const posted: WorkerResponse[] = []
    const actions = deviceActions(new AnalysisSession(), openDeviceLibrary(), (m) => posted.push(m))
    return { actions, posted }
  }

  it('fails the load with the unreadable message instead of showing an empty library', async () => {
    const { actions } = actionsOn({ open: 'error' })
    await expect(actions.load({ massKg: 70, bikeMassKg: 9 })).rejects.toThrow(KEPT_NOT_READ)
  })

  it('does not confirm Remove all, and says the results were not removed', async () => {
    const { actions, posted } = actionsOn({ open: 'error' })

    await expect(actions.forget()).resolves.toBe(false)
    expect(posted).toEqual([{ type: 'deviceIssue', issue: 'notForgotten' }])
  })

  it('confirms Remove all when the browser offers no storage, since nothing was kept', async () => {
    const { actions, posted } = actionsOn({ open: 'no-storage' })

    await expect(actions.forget()).resolves.toBe(true)
    expect(posted).toEqual([{ type: 'libraryActivities', activities: [] }])
  })
})

describe('device library routes', () => {
  const ROUTE: RouteShape = {
    points: [
      [0, 0],
      [1, 0.5],
    ],
    aspect: 2,
  }

  it('keeps a route with its digest, and removes it with the digest', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    const library = openDeviceLibrary()

    await library.put('run-1', MEASURED, ROUTE)

    expect(await library.route('run-1')).toEqual(ROUTE)
    expect(await library.get('run-1')).toEqual(MEASURED)
    expect(await library.all()).toEqual([{ workoutKey: 'run-1', digest: MEASURED }])

    await library.remove('run-1')
    expect(await library.route('run-1')).toBeNull()
  })

  it('keeps a digest put without a route with no route', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    const library = openDeviceLibrary()

    await library.put('run-1', MEASURED)

    expect(await library.route('run-1')).toBeNull()
  })

  it('drops the old route when a replacement comes without one', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED, ROUTE)

    await library.put('run-1', MEASURED)

    expect(await library.route('run-1')).toBeNull()
  })

  it('reads a row stored before routes were kept, with no route', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    fake.rows.set('run-1', serializeDigest(MEASURED))
    const library = openDeviceLibrary()

    expect(await library.get('run-1')).toEqual(MEASURED)
    expect(await library.route('run-1')).toBeNull()
  })

  it('drops a stored route that is not a route, and keeps the digest', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    fake.rows.set('run-1', { digest: serializeDigest(MEASURED), route: { points: 'outline' } })
    const library = openDeviceLibrary()

    expect(await library.get('run-1')).toEqual(MEASURED)
    expect(await library.route('run-1')).toBeNull()
  })

  it('reads no route when storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)

    await expect(openDeviceLibrary().route('run-1')).resolves.toBeNull()
  })

  it('clears the routes with the digests', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED, ROUTE)

    await library.clear()

    expect(await library.route('run-1')).toBeNull()
    expect(await library.get('run-1')).toBeNull()
  })
})
