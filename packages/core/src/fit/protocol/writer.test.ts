import { describe, expect, it } from 'vitest'
import { BASE } from './baseTypes'
import { defineLayout, FitWriter } from './writer'

describe('FIT message definitions', () => {
  it('sets the endian ability bit on multi-byte base types', () => {
    const layout = defineLayout(20, [
      { name: 'heartRate', num: 3, base: BASE.uint8 },
      { name: 'power', num: 7, base: BASE.uint16 },
      { name: 'timestamp', num: 253, base: BASE.uint32 },
      { name: 'positionLat', num: 0, base: BASE.sint32 },
    ])
    const writer = new FitWriter()
    writer.message(layout, { heartRate: 150, power: 250, timestamp: 1_000, positionLat: -10 })

    const bytes = writer.finish()
    // 14-byte header, then a six-byte definition header and four field triples.
    expect(Array.from(bytes.subarray(20, 32))).toEqual([
      3,
      1,
      0x02, // uint8
      7,
      2,
      0x84, // uint16
      253,
      4,
      0x86, // uint32
      0,
      4,
      0x85, // sint32
    ])
  })
})
