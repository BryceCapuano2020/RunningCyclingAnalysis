import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActivityDigest } from '../types'
import { digestActivity, digestActivityAt } from './digestActivity'
import { digestHash } from './test/digestHashes'
import {
  EVENING_UTC_MS,
  NOON_UTC_MS,
  fitWithLocalTime,
  gpxBytes,
  readFile,
  shortRun,
  tcxBytes,
  withZoneDesignator,
} from './test/gateLocalDay'
import type { Activity } from '../types'

/**
 * The local-day field is gated: a digest made at `MODEL_REVISION` 6 is byte for byte what it was before the
 * field existed, although the importer now reads the zone from the file. The hashes below were taken from
 * main (2b6a75cd) before the importer read it, on files that each carry a local time. `identity.test.ts` and
 * `sessionIdentity.test.ts` are the same proof on the sample dataset and are unchanged.
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

const GPX_LATE_UTC_MS = Date.UTC(2026, 2, 14, 23, 0, 0)
const TCX_MORNING_UTC_MS = Date.UTC(2026, 2, 15, 6, 30, 0)

interface Fixture {
  make: () => Activity
  hash: string
  /** The shift the file gives, or undefined for a file that gives none. */
  shift: -1 | 0 | 1 | undefined
}

const MAIN: Record<string, Fixture> = {
  'FIT +9 h at 20:00 UTC': {
    make: () => readFile(fitWithLocalTime(shortRun(EVENING_UTC_MS), 9 * 3600), 'a.fit'),
    hash: '93d8f40316cdff62f796b977ede4ebf383e037e9a5e2e772ba047871b2fc2ba7',
    shift: 1,
  },
  'FIT +5:30 at 20:00 UTC': {
    make: () => readFile(fitWithLocalTime(shortRun(EVENING_UTC_MS), 19_800), 'a.fit'),
    hash: '93d8f40316cdff62f796b977ede4ebf383e037e9a5e2e772ba047871b2fc2ba7',
    shift: 1,
  },
  'FIT +5:30 at 12:00 UTC': {
    make: () => readFile(fitWithLocalTime(shortRun(NOON_UTC_MS), 19_800), 'a.fit'),
    hash: 'f5bbc51886d02106fd2563dd6cf8ec1f0e4bcedba65c1f35e3bac6551434a7cc',
    shift: 0,
  },
  'FIT local time equal to UTC': {
    make: () => readFile(fitWithLocalTime(shortRun(EVENING_UTC_MS), 0), 'a.fit'),
    hash: '93d8f40316cdff62f796b977ede4ebf383e037e9a5e2e772ba047871b2fc2ba7',
    shift: 0,
  },
  'FIT with no local time': {
    make: () => readFile(fitWithLocalTime(shortRun(EVENING_UTC_MS), null), 'a.fit'),
    hash: '93d8f40316cdff62f796b977ede4ebf383e037e9a5e2e772ba047871b2fc2ba7',
    shift: undefined,
  },
  'FIT with a local time 20 h from UTC': {
    make: () => readFile(fitWithLocalTime(shortRun(EVENING_UTC_MS), 20 * 3600), 'a.fit'),
    hash: '93d8f40316cdff62f796b977ede4ebf383e037e9a5e2e772ba047871b2fc2ba7',
    shift: undefined,
  },
  'GPX +02:00 at 23:00 UTC': {
    make: () => readFile(withZoneDesignator(gpxBytes(shortRun(GPX_LATE_UTC_MS)), 120), 'a.gpx'),
    hash: 'b9594700e93efad5f9ece11d05ae841b2a1d64b3d7f36c074567b4a77c475477',
    shift: 1,
  },
  'GPX in UTC (Z)': {
    make: () => readFile(gpxBytes(shortRun(EVENING_UTC_MS)), 'a.gpx'),
    hash: '085779c1cf55d3b99207f5f051b04366fc8ab962bc8afa405ea6d70781db659a',
    shift: undefined,
  },
  'TCX -07:00 at 06:30 UTC': {
    make: () => readFile(withZoneDesignator(tcxBytes(shortRun(TCX_MORNING_UTC_MS)), -420), 'a.tcx'),
    hash: '6ee24810f2d6f31a308f1d2fd54080d8dcd46c987860ed0d8e1ba03cfb7c1926',
    shift: -1,
  },
}

/** The digest as revision 6 would write it, from one made at revision 7: no field, and the revision put back. */
function asRevision6(digest: ActivityDigest): ActivityDigest {
  const { localDayShift: _shift, ...rest } = digest
  return { ...rest, modelRevision: 6 }
}

describe('the digest below revision 7', () => {
  for (const [name, { make, hash }] of Object.entries(MAIN)) {
    it(`of a ${name} is the digest main made, by default and at revision 6`, async () => {
      const digest = digestActivity(make())
      expect(await digestHash(digest)).toBe(hash)
      expect(await digestHash(digestActivityAt(make(), 6))).toBe(hash)
      expect(digest).not.toHaveProperty('localDayShift')
    })
  }
})

describe('the digest at revision 7', () => {
  for (const [name, { make, hash, shift }] of Object.entries(MAIN)) {
    it(`of a ${name} adds only the day shift the file gives`, async () => {
      const digest = digestActivityAt(make(), 7)
      expect(digest.modelRevision).toBe(7)
      expect(digest.localDayShift).toBe(shift)
      expect(Object.hasOwn(digest, 'localDayShift')).toBe(shift !== undefined)
      // Everything else is the digest main made.
      expect(await digestHash(asRevision6(digest))).toBe(hash)
    })
  }
})
