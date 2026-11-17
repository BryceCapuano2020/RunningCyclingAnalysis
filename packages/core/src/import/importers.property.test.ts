import { describe, expect, it } from 'vitest'
import { encodeFit } from '../fit/encode'
import { encodeGpx } from '../gpx/encode'
import { encodeTcx } from '../tcx/encode'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { check, fc } from '../test/property'
import type { Activity } from '../types'
import { parseActivityFile } from './index'
import type { ParseResult } from './result'

/*
 * Importers read files from strangers. Whatever the bytes, a parse returns a result and never throws, and a result that says
 * ok holds activities whose series agree on their length. Mutations start from valid synthetic files, so they get past the
 * header and reach the record decoders, which random bytes seldom do.
 */

const FORMATS = [
  { ext: 'fit', encode: (a: Activity) => encodeFit(a) },
  { ext: 'gpx', encode: (a: Activity) => encodeGpx(a) },
  { ext: 'tcx', encode: (a: Activity) => encodeTcx(a) },
] as const

const base = syntheticActivity({
  n: 90,
  startMs: Date.UTC(2024, 5, 1, 8),
  speed: Float64Array.from({ length: 90 }, (_, i) => 3 + (i % 7) / 10),
  power: Float64Array.from({ length: 90 }, (_, i) => 150 + (i % 11)),
  sport: 'ride',
})
const VALID = FORMATS.map((f) => ({ ...f, bytes: f.encode(base) }))

function holdsTogether(result: ParseResult): void {
  expect(typeof result.ok).toBe('boolean')
  if (!result.ok) {
    expect(typeof result.reason).toBe('string')
    return
  }
  for (const a of result.activities) {
    expect(a.n).toBeGreaterThan(0)
    for (const series of [a.speed, a.distance, a.altitude, a.heartRate, a.power, a.paused]) {
      expect(series.length).toBe(a.n)
    }
    expect(Number.isFinite(a.startMs)).toBe(true)
  }
}

describe('importers on arbitrary input', () => {
  for (const { ext } of FORMATS) {
    it(`${ext}: random bytes never throw`, () => {
      check(
        fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
          holdsTogether(parseActivityFile(bytes, `x.${ext}`))
        }),
        150,
      )
    })
  }

  for (const { ext, bytes } of VALID) {
    it(`${ext}: the unmutated synthetic file imports`, () => {
      const result = parseActivityFile(bytes, `x.${ext}`)
      expect(result.ok).toBe(true)
    })

    it(`${ext}: flipped, cut and spliced valid files never throw`, () => {
      const edits = fc.array(
        fc.record({ at: fc.nat(bytes.length - 1), value: fc.integer({ min: 0, max: 255 }) }),
        { maxLength: 12 },
      )
      check(
        fc.property(
          edits,
          fc.option(fc.nat(bytes.length), { nil: undefined }),
          fc.uint8Array({ maxLength: 40 }),
          (flips, cut, insert) => {
            const mutated = Uint8Array.from(bytes)
            for (const { at, value } of flips) mutated[at] = value
            const cutAt = cut ?? mutated.length
            const spliced = new Uint8Array([
              ...mutated.subarray(0, cutAt >> 1),
              ...insert,
              ...mutated.subarray(cutAt >> 1, cutAt),
            ])
            holdsTogether(parseActivityFile(spliced, `x.${ext}`))
          },
        ),
        150,
      )
    })
  }
})
