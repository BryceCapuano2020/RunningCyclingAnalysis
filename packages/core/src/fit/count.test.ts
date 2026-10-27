import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { countActivityFiles } from './count'
import type { RangedSource } from './count'
import { DEFAULT_EXTRACT_LIMITS } from './archive'

const FIT = new Uint8Array([14, 16, 0, 0, 1, 2, 3, 4, 46, 70, 73, 84, 9, 9])

function fileSource(name: string, bytes: Uint8Array<ArrayBuffer>): File {
  return new File([bytes], name)
}

/**
 * A zip of two FIT files whose end is rewritten: a ZIP64 record and locator, then an End of Central
 * Directory that gives `entries` and a comment of `comment` bytes. The directory itself is unchanged.
 */
function zipWithEnd(entries: number, comment: number): Uint8Array<ArrayBuffer> {
  const plain = zipSync({ 'a.fit': FIT, 'b.fit': FIT })
  const eocd = plain.length - 22
  const view = new DataView(plain.buffer, plain.byteOffset, plain.byteLength)
  const body = plain.slice(0, eocd)
  const tail = new Uint8Array(56 + 20 + 22 + comment)
  const t = new DataView(tail.buffer)
  // The ZIP64 record, at the end of the body.
  t.setUint32(0, 0x06064b50, true)
  t.setBigUint64(4, 44n, true)
  t.setBigUint64(24, BigInt(entries), true)
  t.setBigUint64(32, BigInt(entries), true)
  t.setBigUint64(40, BigInt(view.getUint32(eocd + 12, true)), true)
  t.setBigUint64(48, BigInt(view.getUint32(eocd + 16, true)), true)
  // The locator, which gives where the record is.
  t.setUint32(56, 0x07064b50, true)
  t.setBigUint64(64, BigInt(body.length), true)
  t.setUint32(72, 1, true)
  // The End of Central Directory, which asks for the ZIP64 values.
  const end = 76
  t.setUint32(end, 0x06054b50, true)
  t.setUint16(end + 10, 0xffff, true)
  t.setUint32(end + 16, 0xffffffff, true)
  t.setUint16(end + 20, comment, true)
  const out = new Uint8Array(body.length + tail.length)
  out.set(body, 0)
  out.set(tail, body.length)
  return out
}

describe('countActivityFiles', () => {
  it('counts the FIT, GPX and TCX entries of a zip, gzipped or not', async () => {
    const bytes = zipSync({
      'activities/1.fit': FIT,
      'activities/2.fit.gz': gzipSync(FIT),
      'activities/3.gpx': strToU8('<gpx/>'),
      'activities/4.tcx.gz': gzipSync(strToU8('<TrainingCenterDatabase/>')),
    })

    expect(await countActivityFiles([fileSource('export.zip', bytes)])).toBe(4)
  })

  it('leaves out other files, folders, KML and macOS metadata', async () => {
    const bytes = zipSync({
      'activities/': new Uint8Array(0),
      'activities/1.fit': FIT,
      'activities/2.kml': strToU8('<kml/>'),
      'activities.csv': strToU8('Activity ID\n1\n'),
      '__MACOSX/activities/._1.fit': strToU8('metadata'),
    })

    expect(await countActivityFiles([fileSource('export.zip', bytes)])).toBe(1)
  })

  it('counts a single activity file as one, and anything else as none', async () => {
    const sources = [
      fileSource('ride.fit', FIT),
      fileSource('ride.fit.gz', gzipSync(FIT)),
      fileSource('route.kml', strToU8('<kml/>')),
      fileSource('notes.txt', strToU8('hello')),
    ]

    expect(await countActivityFiles(sources)).toBe(2)
  })

  it('adds the counts of several sources', async () => {
    const zip = zipSync({ 'a.fit': FIT, 'b.fit': FIT })

    expect(await countActivityFiles([fileSource('one.zip', zip), fileSource('two.fit', FIT)])).toBe(
      3,
    )
  })

  it('does not know the total of a zip that holds a zip, since its entries are only listed once read', async () => {
    const inner = zipSync({ 'a.fit': FIT })
    const bytes = zipSync({ 'activities/1.fit': FIT, 'DI-Connect/export.zip': inner })

    expect(await countActivityFiles([fileSource('export.zip', bytes)])).toBeNull()
  })

  it('does not know the total of a file whose directory cannot be read', async () => {
    const damaged = new Uint8Array(200).fill(7)

    expect(await countActivityFiles([fileSource('broken.zip', damaged)])).toBeNull()
  })

  it('gives no count when a header in the directory is corrupt, not the headers before it', async () => {
    const bytes = zipSync({ 'a.fit': FIT, 'b.fit': FIT, 'c.fit': FIT })
    const headers: number[] = []
    for (let i = 0; i + 3 < bytes.length; i++) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2) {
        headers.push(i)
      }
    }
    expect(headers).toHaveLength(3)
    bytes[headers[1]!] = 0

    expect(await countActivityFiles([fileSource('bad.zip', bytes)])).toBeNull()
  })

  it('gives no count when the directory ends part way through a header', async () => {
    const bytes = zipSync({ 'a.fit': FIT, 'b.fit': FIT })
    const eocd = bytes.length - 22
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    view.setUint32(eocd + 12, view.getUint32(eocd + 12, true) - 10, true)

    expect(await countActivityFiles([fileSource('short.zip', bytes)])).toBeNull()
  })

  it('finds the ZIP64 record behind a comment as long as a zip allows', async () => {
    const bytes = zipWithEnd(2, 0xffff)

    expect(await countActivityFiles([fileSource('big.zip', bytes)])).toBe(2)
  })

  it('counts a directory larger than one read chunk, from its headers', async () => {
    const files: Record<string, Uint8Array> = { 'notes.txt': strToU8('hello') }
    for (let i = 0; i < 3000; i++) files[`activities/${i}-${'x'.repeat(40)}.fit`] = FIT
    const bytes = zipSync(files)

    expect(await countActivityFiles([fileSource('many.zip', bytes)])).toBe(3000)
  })

  it('refuses a directory that lists more entries than extraction accepts, without reading it', async () => {
    const bytes = zipWithEnd(1_000_000, 0)
    const file = fileSource('huge.zip', bytes)
    const slice = vi.spyOn(file, 'slice')

    expect(await countActivityFiles([file])).toBeNull()
    expect(slice).toHaveBeenCalledOnce()
  })

  it('refuses a directory larger in bytes than extraction accepts', async () => {
    const bytes = zipSync({ 'a.fit': FIT })

    expect(
      await countActivityFiles([fileSource('a.zip', bytes)], {
        ...DEFAULT_EXTRACT_LIMITS,
        maxBufferedBytes: 8,
      }),
    ).toBeNull()
  })

  it('stops the walk at the entry limit when the directory lists fewer entries than it holds', async () => {
    const bytes = zipSync({ 'a.fit': FIT, 'b.fit': FIT })
    const eocd = bytes.length - 22
    new DataView(bytes.buffer).setUint16(eocd + 10, 1, true)

    expect(
      await countActivityFiles([fileSource('lying.zip', bytes)], {
        ...DEFAULT_EXTRACT_LIMITS,
        maxArchiveEntries: 1,
      }),
    ).toBeNull()
  })

  it('reads the directory and never the entries, so a large export costs little to count', async () => {
    const big = new Uint8Array(4 * 1024 * 1024).fill(3)
    const bytes = zipSync({ 'big.bin': [big, { level: 0 }], 'a.fit': FIT, 'b.fit': FIT }, {})
    const file = fileSource('export.zip', bytes)
    const slice = vi.spyOn(file, 'slice')
    const source: RangedSource = file

    expect(await countActivityFiles([source])).toBe(2)

    const bytesRead = slice.mock.calls.reduce((sum, [start, end]) => sum + (end! - start!), 0)
    expect(bytesRead).toBeLessThan(bytes.length / 10)
  })
})

describe('countActivityFiles with a filter on the zip entries', () => {
  it('counts only the activity files the filter keeps', async () => {
    const bytes = zipSync({
      'activities/1.fit': FIT,
      'activities/2.gpx.gz': gzipSync(strToU8('gpx')),
      'routes/1.gpx': strToU8('gpx'),
      'routes/2.tcx.gz': gzipSync(strToU8('tcx')),
    })
    const listed = (entry: string) => entry.startsWith('activities/')

    expect(
      await countActivityFiles([fileSource('export.zip', bytes)], DEFAULT_EXTRACT_LIMITS, listed),
    ).toBe(2)
    expect(await countActivityFiles([fileSource('export.zip', bytes)])).toBe(4)
  })

  it('does not filter a single file', async () => {
    const sources = [fileSource('ride.fit', FIT)]

    expect(await countActivityFiles(sources, DEFAULT_EXTRACT_LIMITS, () => false)).toBe(1)
  })
})
