import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import type { RouteShape } from '@rca/core/route/routeShape'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** `setLabel`: the athlete's label written to a kept row, on the real library over a fresh fake IndexedDB. */

const [activity] = sampleDataset().activities
if (activity === undefined) throw new Error('The sample has no activities')
const DIGEST = digestActivity(activity)
const KEY = 'run-1'
const FILE = { fileName: 'activities/1.fit', fileHash: 'a'.repeat(64) }
const ROUTE: RouteShape = {
  points: [
    [0, 0],
    [0.5, 0.2],
    [1, 1],
  ],
  aspect: 1.5,
}

async function fresh() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const { openDeviceLibrary } = await import('./deviceLibrary')
  const { deviceFileOf } = await import('./deviceFile')
  const library = openDeviceLibrary()
  await library.put(KEY, DIGEST, ROUTE, deviceFileOf(FILE))
  return library
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

const HIKE = { from: null, athleteType: 'hike' } as const

describe('labelling a kept workout', () => {
  it('sets the label and takes it off, keeping the route and the file', async () => {
    const library = await fresh()
    expect(await library.setLabel(KEY, DIGEST.id, HIKE)).toBe(true)
    expect((await library.get(KEY))?.athleteType).toBe('hike')
    expect(await library.route(KEY)).toEqual(ROUTE)
    expect((await library.all())[0]?.file).toBeDefined()

    expect(await library.setLabel(KEY, DIGEST.id, { from: 'hike', athleteType: null })).toBe(true)
    const back = await library.get(KEY)
    expect(back).not.toHaveProperty('athleteType')
    expect(back).toEqual(DIGEST)
    expect(await library.route(KEY)).toEqual(ROUTE)
  })

  it('leaves a row alone that holds another label than the change reads, or holds another digest', async () => {
    const library = await fresh()
    await library.setLabel(KEY, DIGEST.id, HIKE)
    // The athlete's own label stands: a change that reads none does not overwrite it.
    expect(await library.setLabel(KEY, DIGEST.id, { from: null, athleteType: 'walk' })).toBe(false)
    expect((await library.get(KEY))?.athleteType).toBe('hike')
    expect(
      await library.setLabel(KEY, 'another-file.fit', { from: 'hike', athleteType: null }),
    ).toBe(false)
    expect((await library.get(KEY))?.athleteType).toBe('hike')
  })

  it('writes nothing for a workout that is not kept', async () => {
    const library = await fresh()
    expect(await library.setLabel('run-2', DIGEST.id, HIKE)).toBe(false)
    expect(await library.all()).toHaveLength(1)
  })

  it('is refused once the library was emptied since the epoch it was written under', async () => {
    const library = await fresh()
    const epoch = await library.epoch()
    await library.clear()
    const { LibraryReplaced } = await import('./deviceFile')
    await expect(library.setLabel(KEY, DIGEST.id, HIKE, epoch)).rejects.toBeInstanceOf(
      LibraryReplaced,
    )
  })
})
