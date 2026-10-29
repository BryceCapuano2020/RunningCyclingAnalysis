import { digestActivity, serializeDigest } from '@rca/core/digest'
import type { RouteShape } from '@rca/core/route/routeShape'
import { sampleDataset } from '@rca/core/synthetic'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDeviceLibrary } from './deviceLibrary'

const [activity] = sampleDataset().activities
if (activity === undefined) throw new Error('The sample has no activities')
const MEASURED = digestActivity(activity)

interface FakeOptions {
  /** `throw`: opening throws. `error`: the open request fails. */
  open?: 'throw' | 'error'
  /** Starting a transaction throws. */
  transaction?: boolean
  /** Clearing the store throws. */
  clear?: boolean
}

/** A request that settles on a later turn, as IndexedDB requests do. */
function settleLater<T>(work: () => T) {
  const pending: { result?: T; error?: Error; onsuccess?: () => void; onerror?: () => void } = {}
  setTimeout(() => {
    try {
      pending.result = work()
      pending.onsuccess?.()
    } catch (error) {
      pending.error = error instanceof Error ? error : new Error(String(error))
      pending.onerror?.()
    }
  }, 0)
  return pending
}

function storeIn(rows: Map<string, unknown>, options: FakeOptions) {
  const sortedKeys = () => [...rows.keys()].sort()
  return {
    getAllKeys: () => settleLater(sortedKeys),
    getAll: () => settleLater(() => sortedKeys().map((key) => rows.get(key))),
    get: (key: string) => settleLater(() => rows.get(key)),
    put: (value: unknown, key: string) => {
      rows.set(key, value)
      return settleLater(() => key)
    },
    delete: (key: string) => {
      rows.delete(key)
      return settleLater(() => undefined)
    },
    clear: () => {
      if (options.clear) throw new Error('Clearing is refused')
      rows.clear()
      return settleLater(() => undefined)
    },
  }
}

interface FakeConnection {
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
      onclose: null,
      onversionchange: null,
      close: () => undefined,
      createObjectStore: () => undefined,
      transaction: () => {
        if (options.transaction) throw new Error('Transactions are refused')
        const store = storeIn(rows, options)
        const transaction: FakeTransaction = { oncomplete: null, objectStore: () => store }
        setTimeout(() => transaction.oncomplete?.(), 0)
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
        onupgradeneeded?: () => void
      } = {}
      setTimeout(() => {
        if (options.open === 'error') {
          pending.error = new Error('Storage is full')
          pending.onerror?.()
          return
        }
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

afterEach(() => {
  vi.unstubAllGlobals()
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

  it('tells a row this version cannot read from no row', async () => {
    const fake = fakeIndexedDb()
    vi.stubGlobal('indexedDB', fake.indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)
    fake.rows.set('ride-2', { not: 'a digest' })

    expect(await library.lookup('run-1')).toEqual(MEASURED)
    expect(await library.lookup('ride-2')).toBe('unreadable')
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

  it.each(REFUSED)('reads as empty and refuses writes when storage %s', async (_, options) => {
    vi.stubGlobal('indexedDB', fakeIndexedDb(options).indexedDB)
    const library = openDeviceLibrary()

    await expect(library.all()).resolves.toEqual([])
    await expect(library.get('run-1')).resolves.toBeNull()
    await expect(library.put('run-1', MEASURED)).rejects.toThrow()
    await expect(library.remove('run-1')).rejects.toThrow()
    await expect(library.clear()).rejects.toThrow()
  })

  it('reads strictly as it reads otherwise, and lists nothing for storage that cannot be opened', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb().indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)
    await expect(library.allStrict()).resolves.toEqual(await library.all())
    await expect(library.allStrict()).resolves.toHaveLength(1)

    for (const open of ['throw', 'error'] as const) {
      vi.stubGlobal('indexedDB', fakeIndexedDb({ open }).indexedDB)
      await expect(openDeviceLibrary().allStrict()).resolves.toEqual([])
    }
  })

  it('rejects a strict read that fails on a database that opened, while the plain read lists nothing', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ transaction: true }).indexedDB)
    const library = openDeviceLibrary()

    await expect(library.all()).resolves.toEqual([])
    await expect(library.allStrict()).rejects.toThrow('Transactions are refused')
  })

  it('keeps the stored digests when a clear is refused', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb({ clear: true }).indexedDB)
    const library = openDeviceLibrary()
    await library.put('run-1', MEASURED)

    await expect(library.clear()).rejects.toThrow('Clearing is refused')
    expect(await library.get('run-1')).toEqual(MEASURED)
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
