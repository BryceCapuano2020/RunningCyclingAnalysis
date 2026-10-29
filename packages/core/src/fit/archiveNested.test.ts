import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
import type { ExtractLimits, FitFile, FitSource } from './archive'

/** A zip inside a zip is read as its bytes arrive, so its size is bounded by the budgets, not held whole. */

const MIB = 1024 * 1024
const DAMAGED = 'Archive is damaged; some activities may be missing'

/** `length` bytes of the same value, which a FIT-sized entry needs to be, and which stored zips keep whole. */
function bytes(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value)
}

/** Distinct small files, `count` of them at `size` bytes each, stored so the zip is as large as its files. */
function files(count: number, size: number): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = {}
  for (let i = 0; i < count; i++) entries[`part/${i}.fit`] = bytes(size, i % 251)
  return entries
}

function chunked(name: string, data: Uint8Array, size: number): FitSource {
  return {
    name,
    arrayBuffer: async () => data.slice().buffer,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let offset = 0; offset < data.length; offset += size) {
            controller.enqueue(data.slice(offset, offset + size))
          }
          controller.close()
        },
      }),
  }
}

async function collect(source: FitSource, limits: Partial<ExtractLimits> = {}) {
  const read: FitFile[] = []
  const errors: { fileName: string; reason: string }[] = []
  const summary = await extractFitFiles(
    source,
    (file) => {
      read.push(file)
    },
    (fileName, rejection) => {
      errors.push({ fileName, reason: rejection.reason })
    },
    { ...DEFAULT_EXTRACT_LIMITS, ...limits },
  )
  return { read, errors, summary }
}

describe('a zip nested in a zip', () => {
  it('can be larger than one entry may be, and larger than the buffer, since it is not held whole', async () => {
    const inner = zipSync(files(300, 2000), { level: 0 })
    const outer = zipSync({ 'big.zip': inner }, { level: 0 })
    const limits = { maxEntryBytes: 10_000, maxBufferedBytes: 40_000 }
    expect(inner.length).toBeGreaterThan(50 * limits.maxEntryBytes)

    const { read, errors, summary } = await collect(new File([outer], 'outer.zip'), limits)

    expect(errors).toEqual([])
    expect(read).toHaveLength(300)
    expect(summary.fitFiles).toBe(300)
    expect(read[299]?.fileName).toBe('big.zip/part/299.fit')
    expect(read[299]?.bytes).toEqual(bytes(2000, 299 % 251))
  })

  it('reads one over the default limit on an entry of 64 MiB, within the default budgets', async () => {
    // 66 MiB of 1 MiB files: more than any entry may be, and 66 times the size of any one file.
    const inner = zipSync(files(66, MIB), { level: 0 })
    const outer = zipSync({ 'UploadedFiles_0-_Part1.zip': inner }, { level: 0 })
    expect(inner.length).toBeGreaterThan(DEFAULT_EXTRACT_LIMITS.maxEntryBytes)

    let count = 0
    let largest = 0
    const errors: string[] = []
    await extractFitFiles(
      chunked('export.zip', outer, 64 * 1024),
      (file) => {
        count++
        largest = Math.max(largest, file.bytes.length)
      },
      (_name, rejection) => errors.push(rejection.reason),
    )

    expect(errors).toEqual([])
    expect(count).toBe(66)
    expect(largest).toBe(MIB)
  }, 30_000)

  it('reads the same files whatever size the source arrives in', async () => {
    const outer = zipSync({ 'a.zip': zipSync(files(20, 3000)), 'top.fit': bytes(500, 7) })
    const whole = await collect(new File([outer], 'outer.zip'))
    const bits = await collect(chunked('outer.zip', outer, 7))

    expect(bits.errors).toEqual([])
    expect(bits.read.map((f) => f.fileName)).toEqual(whole.read.map((f) => f.fileName))
    expect(bits.read).toHaveLength(21)
  })

  it('counts its bytes against the shared decompressed budget as it streams, and stops the archive', async () => {
    const inner = zipSync(files(10, 5000), { level: 0 })
    const outer = zipSync({ 'big.zip': inner, 'after.fit': bytes(100, 1) }, { level: 0 })
    const { read, errors } = await collect(new File([outer], 'outer.zip'), {
      maxTotalDecompressedBytes: Math.floor(inner.length / 2),
    })

    // The entry whose bytes took the budget past its limit is the one reported: the zip, once.
    expect(errors).toHaveLength(1)
    expect(errors[0]?.reason).toMatch(/^Archive expands to more than /)
    expect(read.length).toBeLessThan(10)
    expect(read.map((f) => f.fileName)).not.toContain('after.fit')
  })

  it('holds back a file of it that would pass the buffer, and reads the rest', async () => {
    const entries = {
      'small.fit': bytes(1000, 1),
      'huge.fit': bytes(30_000, 2),
      'next.fit': bytes(1000, 3),
    }
    const outer = zipSync({ 'in.zip': zipSync(entries, { level: 0 }) })
    const { read, errors } = await collect(new File([outer], 'outer.zip'), {
      maxEntryBytes: 20_000,
    })

    expect(read.map((f) => f.fileName).sort()).toEqual(['in.zip/next.fit', 'in.zip/small.fit'])
    expect(errors).toEqual([
      { fileName: 'in.zip/huge.fit', reason: 'Archive entry exceeds the 20000-byte limit' },
    ])
  })

  it('delivers the files before a cut in it, and reports the file and the archive that were cut', async () => {
    const inner = zipSync(files(6, 3000), { level: 0 })
    const cut = inner.slice(0, Math.floor(inner.length * 0.45))
    const outer = zipSync({ 'cut.zip': cut, 'after.fit': bytes(100, 1) }, { level: 0 })
    const { read, errors } = await collect(new File([outer], 'outer.zip'))

    expect(read.map((f) => f.fileName)).toEqual([
      'cut.zip/part/0.fit',
      'cut.zip/part/1.fit',
      'after.fit',
    ])
    // As a cut zip at the top does: the file it cut, then the archive, unreadable and with a damaged list.
    expect(errors.map((e) => [e.fileName, e.reason])).toEqual([
      ['cut.zip/part/2.fit', 'File is incomplete or corrupt'],
      ['cut.zip', 'Could not read archive'],
      ['cut.zip', DAMAGED],
    ])
  })

  it('reports a nested zip whose own bytes are corrupt once, under its name, and goes on', async () => {
    const outer = zipSync({
      'bad.zip': zipSync({ 'a.fit': bytes(900, 4) }),
      'ok.fit': bytes(10, 9),
    })
    // Break the deflate stream of the outer entry that holds the zip.
    const at = outer.indexOf(0x50) + 40
    for (let i = 0; i < 20; i++) outer[at + i] = 0xff
    const { read, errors } = await collect(new File([outer], 'outer.zip'))

    expect(read.map((f) => f.fileName)).toEqual(['ok.fit'])
    expect(errors).toEqual([{ fileName: 'bad.zip', reason: 'Could not decompress this file' }])
  })

  it('still refuses an entry-count bomb in it, without reading what is past the limit', async () => {
    const outer = zipSync({
      'many.zip': zipSync(files(50, 10), { level: 0 }),
      'z.fit': bytes(9, 1),
    })
    const { read, errors } = await collect(new File([outer], 'outer.zip'), {
      maxArchiveEntries: 10,
    })

    expect(read).toHaveLength(9)
    expect(errors).toEqual([
      { fileName: 'many.zip/part/9.fit', reason: 'Archive exceeds the 10-entry limit' },
    ])
  })
})
