import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../math'
import { crc16 } from './crc'

/** The SDK's definition, a nibble at a time: the checksum every faster reading must give. */
function nibbleCrc(bytes: Uint8Array, start: number, end: number, seed: number): number {
  const table = [
    0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401,
    0x5000, 0x9c01, 0x8801, 0x4400,
  ]
  let crc = seed
  for (let i = start; i < end; i++) {
    const byte = bytes[i]!
    for (const nibble of [byte & 0x0f, (byte >> 4) & 0x0f]) {
      crc = ((crc >> 4) & 0x0fff) ^ table[crc & 0x0f]! ^ table[nibble]!
    }
  }
  return crc
}

describe('crc16', () => {
  it('is the FIT SDK checksum of random bytes, ranges and seeds', () => {
    const random = mulberry32(3)
    const bytes = Uint8Array.from({ length: 5000 }, () => Math.floor(random() * 256))
    for (const [start, end, seed] of [
      [0, 5000, 0],
      [0, 12, 0],
      [17, 4093, 0],
      [0, 5000, 0xbeef],
      [100, 100, 0x1234],
    ] as const) {
      expect(crc16(bytes, start, end, seed)).toBe(nibbleCrc(bytes, start, end, seed))
    }
  })

  it('continues from a seed, as one pass over both parts does', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff)
    expect(crc16(bytes, 100, 300, crc16(bytes, 0, 100))).toBe(crc16(bytes))
  })
})
