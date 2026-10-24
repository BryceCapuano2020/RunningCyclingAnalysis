import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from './archive'
import { readZipEntry } from './zipEntry'

const CSV = strToU8('Activity Name,Filename\nMorning Run,activities/1.fit\n')

function fileOf(name: string, bytes: Uint8Array): File {
  return new File([new Uint8Array(bytes)], name)
}

interface HandEntry {
  name: string
  data: Uint8Array
  /** The uncompressed size. Defaults to the data's length, which is right for a stored entry. */
  size?: number
  method?: number
  flags?: number
  /** Writes the sizes and offset as 0xFFFFFFFF in the central directory, and the real values in its ZIP64 extra field. */
  zip64?: boolean
  /** The name the local header gives, when it is not the central directory's name. */
  localName?: string
  /** The local header's signature, when it is not the zip's own. */
  localSignature?: number
}

const LOCAL_SIGNATURE = 0x04034b50

/** The first `count` bytes of a seeded pseudo-random sequence, which deflate cannot shrink. */
function noise(count: number): Uint8Array {
  const out = new Uint8Array(count)
  let state = 1
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    out[i] = state >>> 24
  }
  return out
}

const isCsv = (name: string) => name === 'activities.csv'

/**
 * A zip written field by field, so a test can choose what a header says: a ZIP64 extra field, an
 * encryption flag, a deflate method over bytes that are not deflate. `lead` pads the front, so the
 * entries start after it.
 */
function handZip(entries: HandEntry[], lead = 0): Uint8Array<ArrayBuffer> {
  const body: Uint8Array[] = [new Uint8Array(lead)]
  const central: Uint8Array[] = []
  let offset = lead
  for (const entry of entries) {
    const name = strToU8(entry.name)
    const localName = strToU8(entry.localName ?? entry.name)
    const method = entry.method ?? 0
    const flags = entry.flags ?? 0
    const size = entry.size ?? entry.data.length
    const local = new Uint8Array(30 + localName.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, entry.localSignature ?? LOCAL_SIGNATURE, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, flags, true)
    lv.setUint16(8, method, true)
    lv.setUint16(26, localName.length, true)
    local.set(localName, 30)
    body.push(local, entry.data)

    const extra = new Uint8Array(entry.zip64 === true ? 28 : 0)
    const ev = new DataView(extra.buffer)
    if (entry.zip64 === true) {
      ev.setUint16(0, 0x0001, true)
      ev.setUint16(2, 24, true)
      ev.setBigUint64(4, BigInt(size), true)
      ev.setBigUint64(12, BigInt(entry.data.length), true)
      ev.setBigUint64(20, BigInt(offset), true)
    }
    const placeholder = entry.zip64 === true
    const header = new Uint8Array(46 + name.length + extra.length)
    const cv = new DataView(header.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, flags, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, placeholder ? 0xffffffff : entry.data.length, true)
    cv.setUint32(24, placeholder ? 0xffffffff : size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, extra.length, true)
    cv.setUint32(42, placeholder ? 0xffffffff : offset, true)
    header.set(name, 46)
    header.set(extra, 46 + name.length)
    central.push(header)
    offset += local.length + entry.data.length
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const parts = [...body, ...central, end]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

describe('readZipEntry', () => {
  it('reads a stored entry and a deflated one', async () => {
    const zip = zipSync({
      'stored.csv': [CSV, { level: 0 }],
      'deflated.csv': CSV,
    })
    const stored = await readZipEntry(fileOf('a.zip', zip), (name) => name === 'stored.csv')
    const deflated = await readZipEntry(fileOf('a.zip', zip), (name) => name === 'deflated.csv')

    expect(stored).toEqual({ name: 'stored.csv', bytes: CSV })
    expect(deflated).toEqual({ name: 'deflated.csv', bytes: CSV })
  })

  it('reads the entry nearest the root of the zip', async () => {
    const zip = zipSync({
      'deep/down/activities.csv': strToU8('deep'),
      'activities.csv': strToU8('root'),
    })
    const found = await readZipEntry(fileOf('a.zip', zip), (name) =>
      name.endsWith('activities.csv'),
    )

    expect(found?.name).toBe('activities.csv')
    expect(new TextDecoder().decode(found?.bytes)).toBe('root')
  })

  it('ignores macOS metadata entries', async () => {
    const zip = zipSync({ '__MACOSX/._activities.csv': CSV })
    expect(
      await readZipEntry(fileOf('a.zip', zip), (name) => name.endsWith('activities.csv')),
    ).toBeNull()
  })

  it('returns null when no entry is wanted', async () => {
    const zip = zipSync({ 'activities/1.fit': CSV })
    expect(await readZipEntry(fileOf('a.zip', zip), (name) => name === 'activities.csv')).toBeNull()
  })

  it('returns null for an entry that inflates past the entry limit', async () => {
    const zip = zipSync({ 'activities.csv': new Uint8Array(1_000_000) })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxEntryBytes: 4_000 }
    expect(
      await readZipEntry(fileOf('a.zip', zip), (name) => name === 'activities.csv', limits),
    ).toBeNull()
  })

  it('returns null for a deflate stream that is corrupt', async () => {
    const zip = handZip([
      {
        name: 'activities.csv',
        data: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
        size: 20,
        method: 8,
      },
    ])
    expect(await readZipEntry(fileOf('a.zip', zip), (name) => name === 'activities.csv')).toBeNull()
  })

  it('returns null for an encrypted entry', async () => {
    const zip = handZip([{ name: 'activities.csv', data: CSV, flags: 1 }])
    expect(await readZipEntry(fileOf('a.zip', zip), (name) => name === 'activities.csv')).toBeNull()
  })

  it('refuses a stored entry whose bytes are over the entry limit', async () => {
    const zip = handZip([{ name: 'activities.csv', data: new Uint8Array(200).fill(65) }])
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxEntryBytes: 100 }
    expect(await readZipEntry(fileOf('a.zip', zip), isCsv, limits)).toBeNull()
  })

  it('refuses a deflated entry whose compressed bytes are over the entry limit', async () => {
    const zip = zipSync({ 'activities.csv': noise(400) })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxEntryBytes: 100 }
    expect(await readZipEntry(fileOf('a.zip', zip), isCsv, limits)).toBeNull()
  })

  it('refuses an entry whose local header names a different file', async () => {
    const zip = handZip([{ name: 'activities.csv', data: CSV, localName: 'other.csv' }])
    expect(await readZipEntry(fileOf('a.zip', zip), isCsv)).toBeNull()
  })

  it('refuses an entry whose local header signature is corrupt', async () => {
    const zip = handZip([{ name: 'activities.csv', data: CSV, localSignature: 0x0badbad0 }])
    expect(await readZipEntry(fileOf('a.zip', zip), isCsv)).toBeNull()
  })

  it('reads a ZIP64 entry whose sizes and offset are in its extra field', async () => {
    const zip = handZip([{ name: 'activities.csv', data: CSV, zip64: true }], 1000)
    const found = await readZipEntry(fileOf('a.zip', zip), (name) => name === 'activities.csv')

    expect(found).toEqual({ name: 'activities.csv', bytes: CSV })
  })
})
