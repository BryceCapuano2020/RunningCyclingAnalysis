import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActivityDigest } from '../types'
import { digestActivity, digestActivityAt } from './digestActivity'
import { digestHash } from './test/digestHashes'
import { LABEL_CASES } from './test/gateAthleteType'

/**
 * The athlete's label is gated: a digest made at `MODEL_REVISION` 6 is byte for byte what it was before the label
 * was read from the export's list. The hashes were taken from main (the commit before E4) on files read with each
 * list type, labelled or not: below revision 7 the type changes nothing. At revision 7 the digest less the label
 * is main's hash.
 */
// An activity's name carries the hour of day in the device's zone ("Evening run"), so the hashes depend on it. They
// were taken in Pacific time; the test sets that zone so it holds on a machine or a runner in any other.
type Env = { env: Record<string, string | undefined> }
const env = (globalThis as { process?: Env }).process!.env
const savedZone = env.TZ
beforeAll(() => {
  env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  if (savedZone === undefined) delete env.TZ
  else env.TZ = savedZone
})

const RUN = '2845bb80bf62c3cb88443aa68b384b4d15955e1f15d3b603383be16102c31f67'
const RIDE = 'bf2f84e0a543384e53d5958d134f743c37ab05fee8e418bc34326f3a18bef5c1'
const MAIN: Record<string, string> = {
  'FIT run listed as Hike': RUN,
  'FIT run listed as Walk': RUN,
  'FIT run listed as Nordic Ski': RUN,
  'FIT run listed as Weight Training': RUN,
  'FIT run listed in German (Wanderung)': RUN,
  'FIT run listed as Run': RUN,
  'FIT run listed as Trail Run': RUN,
  'FIT ride listed as Ride': RIDE,
  'FIT ride listed as Hike': RIDE,
  'TCX run listed as Hike': '28bae49da2c4b5737a3b802e6c1a2d4c242b2662668b7a8c6a3fed7015c3453d',
}

function asRevision6(digest: ActivityDigest): ActivityDigest {
  const { athleteType: _label, ...rest } = digest
  return { ...rest, modelRevision: 6 }
}

describe('the digest below revision 7', () => {
  it('covers every case', () => {
    expect(Object.keys(MAIN).sort()).toEqual(Object.keys(LABEL_CASES).sort())
  })

  for (const [name, hash] of Object.entries(MAIN)) {
    it(`of a ${name} is the digest main made, by default and at revision 6`, async () => {
      const make = LABEL_CASES[name]!.make
      const digest = digestActivity(make())
      expect(await digestHash(digest)).toBe(hash)
      expect(await digestHash(digestActivityAt(make(), 6))).toBe(hash)
      expect(digest).not.toHaveProperty('athleteType')
    })
  }
})

describe('the digest at revision 7', () => {
  for (const [name, hash] of Object.entries(MAIN)) {
    it(`of a ${name} adds only the label the list type names`, async () => {
      const { make, label } = LABEL_CASES[name]!
      const digest = digestActivityAt(make(), 7)
      expect(digest.athleteType).toBe(label)
      expect(Object.hasOwn(digest, 'athleteType')).toBe(label !== undefined)
      expect(await digestHash(asRevision6(digest))).toBe(hash)
    })
  }
})
