import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
import type { ExtractLimits, FitFile, FitSource } from './archive'
import { streamedZip, toZip64 } from './zipTestFiles'

/** A zip inside a zip is read as its bytes arrive, so its size is bounded by the budgets, not held whole. */

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

/** Bytes that do not compress, so a zip of them is as large as they are. */
function noise(length: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = 12345
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    out[i] = x >>> 24
  }
  return out
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
    const limits = { maxEntryBytes: 10_000, maxBufferedBytes: 200_000 }
    expect(inner.length).toBeGreaterThan(50 * limits.maxEntryBytes)

    const { read, errors, summary } = await collect(new File([outer], 'outer.zip'), limits)

    expect(errors).toEqual([])
    expect(read).toHaveLength(300)
    expect(summary.fitFiles).toBe(300)
    expect(read[299]?.fileName).toBe('big.zip/part/299.fit')
    expect(read[299]?.bytes).toEqual(bytes(2000, 299 % 251))
  })

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
    // Where the damage lands in the nested zip depends on its bytes, which include a time stamp, so the
    // stream fails in the outer entry's deflate or in the nested zip's own. Either way: once, under its name.
    const reasons = new Set<string>()
    for (let step = 0; step < 60; step++) {
      const mtime = Date.UTC(2024, 0, 1) + step * 7_919_000
      const outer = zipSync(
        { 'bad.zip': zipSync({ 'a.fit': bytes(900, 4) }, { mtime }), 'ok.fit': bytes(10, 9) },
        { mtime },
      )
      // Break the deflate stream of the outer entry that holds the zip.
      const at = outer.indexOf(0x50) + 40
      for (let i = 0; i < 20; i++) outer[at + i] = 0xff
      const { read, errors } = await collect(new File([outer], 'outer.zip'))

      expect(read.map((f) => f.fileName)).toEqual(['ok.fit'])
      expect(errors.map((e) => e.fileName)).toEqual(['bad.zip'])
      reasons.add(errors[0]!.reason)
    }
    expect([...reasons].sort()).toEqual([
      'Could not decompress this file',
      'Could not read archive',
    ])
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

  it('reads one written with data descriptors, as macOS and streaming tools write them, nested or not', async () => {
    const inner = streamedZip({ 'a.fit': bytes(900, 1), 'b.fit': bytes(1200, 2) })
    // The flag that says sizes follow the data is set in each local header of both zips.
    expect(localFlags(inner).every((flags) => (flags & 8) !== 0)).toBe(true)
    const nested = await collect(
      new File([streamedZip({ 'in.zip': inner, 'c.fit': bytes(5, 3) })], 'o.zip'),
    )
    const top = await collect(new File([inner], 'inner.zip'))

    expect(nested.errors).toEqual([])
    expect(nested.read.map((f) => f.fileName).sort()).toEqual([
      'c.fit',
      'in.zip/a.fit',
      'in.zip/b.fit',
    ])
    expect(nested.read.find((f) => f.fileName === 'in.zip/b.fit')?.bytes).toEqual(bytes(1200, 2))
    expect(top.read.map((f) => f.fileName)).toEqual(['a.fit', 'b.fit'])
  })

  it('reads one written with ZIP64 records, nested in a zip that has them or not', async () => {
    const inner = toZip64(zipSync({ 'a.fit': bytes(900, 1), 'b.fit': bytes(1200, 2) }))
    const plain = await collect(new File([zipSync({ 'in.zip': inner })], 'o.zip'))
    const both = await collect(new File([toZip64(zipSync({ 'in.zip': inner }))], 'o.zip'))

    for (const { read, errors } of [plain, both]) {
      expect(errors).toEqual([])
      expect(read.map((f) => f.fileName)).toEqual(['in.zip/a.fit', 'in.zip/b.fit'])
    }
  })

  it('reads one with data descriptors that is cut, and says it is incomplete', async () => {
    const inner = streamedZip({ 'a.fit': bytes(900, 1), 'b.fit': noise(40_000) })
    const cut = inner.slice(0, inner.length - 3000)
    const { read, errors } = await collect(new File([zipSync({ 'in.zip': cut })], 'o.zip'))

    expect(read.map((f) => f.fileName)).toEqual(['in.zip/a.fit'])
    expect(errors.map((e) => e.fileName)).toContain('in.zip/b.fit')
  })
})

/** The general purpose flags of each local file header of a zip. */
function localFlags(zip: Uint8Array): number[] {
  const flags: number[] = []
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  for (let at = 0; at + 30 < zip.length; at++) {
    if (view.getUint32(at, true) === 0x04034b50) flags.push(view.getUint16(at + 6, true))
  }
  return flags
}
