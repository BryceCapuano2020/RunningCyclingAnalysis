import { Zip, ZipDeflate } from 'fflate'

/** Zips as other tools write them, which fflate's zipSync does not: a ZIP64 end record, and data descriptors. */

/** Rewrites a zipSync archive with a ZIP64 end record, locator and placeholder EOCD. */
export function toZip64(zip: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const eocd = zip.length - 22
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const entries = view.getUint16(eocd + 10, true)
  const cdSize = view.getUint32(eocd + 12, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  const record = new Uint8Array(56)
  const rv = new DataView(record.buffer)
  rv.setUint32(0, 0x06064b50, true)
  rv.setBigUint64(4, BigInt(44), true)
  rv.setUint16(12, 45, true)
  rv.setUint16(14, 45, true)
  rv.setBigUint64(24, BigInt(entries), true)
  rv.setBigUint64(32, BigInt(entries), true)
  rv.setBigUint64(40, BigInt(cdSize), true)
  rv.setBigUint64(48, BigInt(cdOffset), true)
  const locator = new Uint8Array(20)
  const lv = new DataView(locator.buffer)
  lv.setUint32(0, 0x07064b50, true)
  lv.setUint32(16, 1, true)
  lv.setBigUint64(8, BigInt(eocd), true)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, 0xffff, true)
  ev.setUint16(10, 0xffff, true)
  ev.setUint32(12, 0xffffffff, true)
  ev.setUint32(16, 0xffffffff, true)
  const out = new Uint8Array(eocd + record.length + locator.length + end.length)
  out.set(zip.subarray(0, eocd), 0)
  out.set(record, eocd)
  out.set(locator, eocd + record.length)
  out.set(end, eocd + record.length + locator.length)
  return out
}

/** A zip written in streaming mode: sizes are only known after each entry, as in a data descriptor. */
export function streamedZip(entries: Record<string, Uint8Array>): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = []
  const zip = new Zip((error, chunk) => {
    if (error) throw error
    parts.push(chunk)
  })
  for (const [name, data] of Object.entries(entries)) {
    const file = new ZipDeflate(name)
    zip.add(file)
    file.push(data, true)
  }
  zip.end()
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
