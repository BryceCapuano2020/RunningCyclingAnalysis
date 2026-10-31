import { describe, expect, it } from 'vitest'
import type { ActivityDigest } from '../types'
import { digestActivity, digestActivityAt } from './digestActivity'
import { digestHash } from './test/digestHashes'
import { TEMPERATURE_CASES } from './test/gateTemperature'

/**
 * The temperature summary is gated: a digest made at `MODEL_REVISION` 6 is byte for byte what it was when the
 * file's temperature was read and ignored. The hashes were taken from main (f118a486) before the summary was
 * written, on runs that each carry a different recorded temperature. They are equal where the runs differ only
 * in temperature, which is the point: below revision 7 the temperature changes nothing.
 */
const SAME_RUN = 'e73e8a2fe7dc3139f796db9e32800708831c842df3c2d9065bb54fc4e870443e'
const MAIN: Record<string, { hash: string; summary: { c: number; coverage: number } | undefined }> =
  {
    'FIT run, a ramp with a three-minute spike': {
      hash: SAME_RUN,
      summary: { c: 21, coverage: 1 },
    },
    'FIT run, no temperature': { hash: SAME_RUN, summary: undefined },
    'FIT run, a reading on 4 seconds in 10': { hash: SAME_RUN, summary: undefined },
    'FIT run of 15 minutes': {
      hash: 'cd34ce937d2c223eaeac6d019c62d577c879917e18392aeb307c65e935a3e61d',
      summary: undefined,
    },
    'FIT run, readings out of range': { hash: SAME_RUN, summary: undefined },
    'FIT run, 13 minutes paused in the middle': {
      hash: 'a387db12d918b0bd199d30c9d16fa6625d4338c5111a9f116c425c672dcba715',
      summary: { c: 20, coverage: 1 },
    },
    'GPX run with a temperature': {
      hash: '0be2a3df65ee69403e5189f5c48eedacadbf5ce3fc6f33abbf00fb4fea84a2f5',
      summary: { c: 21, coverage: 1 },
    },
    'TCX run with a temperature': {
      hash: '2f864e783c5568302193cdfbcd161f586d71ca80b4015a64f04e326f1a7bd889',
      summary: { c: 21, coverage: 1 },
    },
  }

/** The digest as revision 6 would write it, from one made at revision 7. */
function asRevision6(digest: ActivityDigest): ActivityDigest {
  const { temperature: _temperature, localDayShift: _shift, ...rest } = digest
  return { ...rest, modelRevision: 6 }
}

describe('the digest below revision 7', () => {
  it('covers every case', () => {
    expect(Object.keys(MAIN).sort()).toEqual(Object.keys(TEMPERATURE_CASES).sort())
  })

  for (const [name, { hash }] of Object.entries(MAIN)) {
    it(`of a ${name} is the digest main made, by default and at revision 6`, async () => {
      const make = TEMPERATURE_CASES[name]!
      const digest = digestActivity(make())
      expect(await digestHash(digest)).toBe(hash)
      expect(await digestHash(digestActivityAt(make(), 6))).toBe(hash)
      expect(digest).not.toHaveProperty('temperature')
    })
  }
})

describe('the digest at revision 7', () => {
  for (const [name, { hash, summary }] of Object.entries(MAIN)) {
    it(`of a ${name} adds only the temperature summary, when there is one`, async () => {
      const digest = digestActivityAt(TEMPERATURE_CASES[name]!(), 7)
      expect(digest.temperature).toEqual(summary)
      expect(Object.hasOwn(digest, 'temperature')).toBe(summary !== undefined)
      expect(await digestHash(asRevision6(digest))).toBe(hash)
    })
  }
})
