import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** `setName`: the athlete's name for a kept workout, on the real library over a fresh fake IndexedDB. */

const [activity] = sampleDataset().activities
if (activity === undefined) throw new Error('The sample has no activities')
const DIGEST = digestActivity(activity)
const KEY = 'run-1'
const FILE = { fileName: 'activities/1.fit', fileHash: 'a'.repeat(64) }

async function fresh() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  const { openDeviceLibrary } = await import('./deviceLibrary')
  const { deviceFileOf } = await import('./deviceFile')
  const library = openDeviceLibrary()
  await library.put(KEY, DIGEST, null, deviceFileOf(FILE))
  return library
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('renaming a kept workout', () => {
  it('writes the name into the digest, keeping the rest of it and the file', async () => {
    const library = await fresh()
    expect(await library.setName(KEY, DIGEST.id, 'Club loop')).toBe(true)
    expect(await library.get(KEY)).toEqual({ ...DIGEST, name: 'Club loop' })
    expect((await library.all())[0]?.file).toBeDefined()
  })

  it('keeps the name when a rebuilt digest of the same workout replaces the row', async () => {
    const library = await fresh()
    await library.setName(KEY, DIGEST.id, 'Club loop')
    await library.put(KEY, { ...DIGEST, modelRevision: DIGEST.modelRevision + 1 })
    expect(await library.get(KEY)).toMatchObject({
      name: 'Club loop',
      modelRevision: DIGEST.modelRevision + 1,
    })
    // A workout never renamed takes the name its file gave.
    await library.put('run-2', DIGEST)
    expect((await library.get('run-2'))?.name).toBe(DIGEST.name)
  })

  it('leaves a row alone that holds another digest, and a workout that is not kept', async () => {
    const library = await fresh()
    expect(await library.setName(KEY, 'another-file.fit', 'Nope')).toBe(false)
    expect(await library.setName('run-9', DIGEST.id, 'Nope')).toBe(false)
    expect((await library.get(KEY))?.name).toBe(DIGEST.name)
  })

  it('is refused once the library was emptied since the epoch it was written under', async () => {
    const library = await fresh()
    const epoch = await library.epoch()
    await library.clear()
    const { LibraryReplaced } = await import('./deviceFile')
    await expect(library.setName(KEY, DIGEST.id, 'Late', epoch)).rejects.toBeInstanceOf(
      LibraryReplaced,
    )
  })
})
