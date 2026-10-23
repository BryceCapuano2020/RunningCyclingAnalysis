import { crc16 } from './crc'

/**
 * Test helpers that write raw FIT bytes by hand, so each protocol rule can be tested on its own.
 * Not used by the library.
 */

export type Endian = 'little' | 'big'

/** Little- or big-endian bytes of an unsigned integer. */
export function int(value: number, size: number, endian: Endian = 'little'): number[] {
  const out: number[] = []
  for (let i = 0; i < size; i++) out.push(Math.floor(value / 256 ** i) % 256)
  return endian === 'little' ? out : out.reverse()
}

/** A definition message. `fields` are [number, size, base type byte]. */
export function definition(
  local: number,
  globalNum: number,
  fields: ReadonlyArray<readonly [number, number, number]>,
  opts: { endian?: Endian; dev?: ReadonlyArray<readonly [number, number, number]> } = {},
): number[] {
  const endian = opts.endian ?? 'little'
  const header = (opts.dev !== undefined ? 0x60 : 0x40) | local
  const bytes = [
    header,
    0,
    endian === 'little' ? 0 : 1,
    ...int(globalNum, 2, endian),
    fields.length,
  ]
  for (const [num, size, base] of fields) bytes.push(num, size, base)
  if (opts.dev !== undefined) {
    bytes.push(opts.dev.length)
    for (const [num, size, index] of opts.dev) bytes.push(num, size, index)
  }
  return bytes
}

/** A FIT file: header (12 or 14 bytes), the given data bytes and the trailing CRC. */
export function fitFile(data: number[], opts: { headerSize?: 12 | 14; headerCrc?: number } = {}) {
  const headerSize = opts.headerSize ?? 14
  const header = [headerSize, 0x20, ...int(2132, 2), ...int(data.length, 4), 0x2e, 0x46, 0x49, 0x54]
  if (headerSize === 14) {
    const crc = opts.headerCrc ?? crc16(Uint8Array.from(header))
    header.push(...int(crc, 2))
  }
  const body = Uint8Array.from([...header, ...data])
  const file = new Uint8Array(body.length + 2)
  file.set(body, 0)
  new DataView(file.buffer).setUint16(body.length, crc16(body), true)
  return file
}
