import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { sampleDataset } from '../synthetic'
import type { Activity, ActivityDigest, AthleteSettings } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { parseDigest, serializeDigest } from './serialize'

const { athlete, activities } = sampleDataset()
const settings: AthleteSettings = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))

/** Parses the serialised digest after applying an edit to its plain-object form. */
function edited(digest: ActivityDigest, edit: (o: Record<string, unknown>) => void): string {
  const o = JSON.parse(serializeDigest(digest)) as Record<string, unknown>
  edit(o)
  return JSON.stringify(o)
}

const curveOf = (o: Record<string, unknown>) => o.curve as Record<string, unknown>[]

describe('serializeDigest and parseDigest', () => {
  it('round-trips every sample digest exactly', () => {
    for (const digest of digests) {
      const json = serializeDigest(digest)
      expect(json).not.toMatch(/NaN|Infinity/)
      expect(parseDigest(json)).toEqual(digest)
    }
  })

  it('restores NaN where a value was missing, and keeps nulls that mean absence', () => {
    const n = 300
    const distance = new Float64Array(n)
    for (let i = 1; i < n; i++) distance[i] = distance[i - 1]! + 4
    distance[n - 1] = NaN
    const activity: Activity = {
      id: 'gappy',
      name: 'Gappy',
      sport: 'run',
      startMs: 5,
      n,
      speed: new Float64Array(n).fill(4),
      distance,
      altitude: new Float64Array(n).fill(100),
      heartRate: new Float64Array(n).fill(150),
      power: new Float64Array(n).fill(NaN),
      paused: new Uint8Array(n),
      hasPower: false,
      hasHeartRate: true,
      hasAltitude: true,
      indoor: false,
    }
    const digest = digestActivity(activity)
    expect(Number.isNaN(digest.distanceM)).toBe(true)
    const parsed = parseDigest(serializeDigest(digest))
    expect(Number.isNaN(parsed.distanceM)).toBe(true)
    expect(parsed.curve[0]!.value).toBeCloseTo(digest.curve[0]!.value, 12)
    // A 300 s run has no calibration, and the longest duration has no window at all.
    expect(parsed.calibration).toBeNull()
    const longest = parsed.curve[DURATIONS_S.length - 1]!
    expect(longest.durationS).toBe(10800)
    expect(Number.isNaN(longest.value)).toBe(true)
    expect(longest.heartRate).toBeNull()
  })

  it('gives the same analysis after a round trip', () => {
    const parsed = digests.map((d) => parseDigest(serializeDigest(d)))
    expect(combine(parsed, settings)).toEqual(combine(digests, settings))
  })

  it('rejects text that is not JSON', () => {
    expect(() => parseDigest('{not json')).toThrow(/parseDigest: not JSON/)
  })

  it('rejects a value that is not an object', () => {
    expect(() => parseDigest('null')).toThrow(/parseDigest: digest must be an object/)
    expect(() => parseDigest('[]')).toThrow(/digest must be an object/)
  })

  it('rejects any version other than 1', () => {
    const json = edited(digests[0]!, (o) => (o.version = 2))
    expect(() => parseDigest(json)).toThrow(/parseDigest: version must be 1, got 2/)
    const missing = edited(digests[0]!, (o) => delete o.version)
    expect(() => parseDigest(missing)).toThrow(/version must be 1/)
  })

  it('rejects a curve of the wrong length or with the wrong durations', () => {
    const short = edited(digests[0]!, (o) => (o.curve = curveOf(o).slice(1)))
    expect(() => parseDigest(short)).toThrow(/curve must have 21 points, got 20/)
    const shifted = edited(digests[0]!, (o) => {
      curveOf(o)[0]!.durationS = 6
    })
    expect(() => parseDigest(shifted)).toThrow(/curve\[0\]\.durationS must be 5, got 6/)
  })

  it('rejects an unknown sport or power source', () => {
    const sport = edited(digests[0]!, (o) => (o.sport = 'swim'))
    expect(() => parseDigest(sport)).toThrow(/sport must be one of run, ride/)
    const source = edited(digests[0]!, (o) => (o.powerSource = 'guess'))
    expect(() => parseDigest(source)).toThrow(/powerSource must be one of measured, virtual, none/)
  })

  it('rejects fields of the wrong type', () => {
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.id = 7)))).toThrow(/id must be a string/)
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.name = null)))).toThrow(
      /name must be a string/,
    )
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.startMs = null)))).toThrow(
      /startMs must be a finite number/,
    )
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.durationS = 1.5)))).toThrow(
      /durationS must be an integer/,
    )
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.hasHeartRate = 'yes')))).toThrow(
      /hasHeartRate must be a boolean/,
    )
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.indoor = 0)))).toThrow(
      /indoor must be a boolean/,
    )
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.maxHeartRate = 'x')))).toThrow(
      /maxHeartRate must be a finite number/,
    )
    expect(() => parseDigest(edited(digests[0]!, (o) => (o.distanceM = 'far')))).toThrow(
      /distanceM must be a number or null/,
    )
  })

  it('rejects a bad curve point', () => {
    expect(() =>
      parseDigest(
        edited(digests[0]!, (o) => {
          curveOf(o)[2] = 'nope' as unknown as Record<string, unknown>
        }),
      ),
    ).toThrow(/curve\[2\] must be an object/)
    expect(() =>
      parseDigest(
        edited(digests[0]!, (o) => {
          curveOf(o)[2]!.startIndex = 1.5
        }),
      ),
    ).toThrow(/curve\[2\]\.startIndex must be an integer/)
    expect(() =>
      parseDigest(
        edited(digests[0]!, (o) => {
          curveOf(o)[2]!.value = 'x'
        }),
      ),
    ).toThrow(/curve\[2\]\.value must be a number or null/)
    expect(() =>
      parseDigest(
        edited(digests[0]!, (o) => {
          curveOf(o)[2]!.heartRate = 'x'
        }),
      ),
    ).toThrow(/curve\[2\]\.heartRate must be a finite number/)
  })

  it('rejects bad power terms, heart-rate blocks, climb sections, flags and calibration', () => {
    const ride = digests.find((d) => d.powerSource === 'measured' && !d.indoor)!
    const withTerms = (o: Record<string, unknown>) => {
      const point = curveOf(o)[0]!
      point.terms = { gravityAccel: 'x', rolling: 1, aero: 1 }
    }
    expect(() => parseDigest(edited(ride, withTerms))).toThrow(/terms\.gravityAccel/)

    expect(() =>
      parseDigest(edited(ride, (o) => (o.hrBlocks = [{ heartRate: 'x', value: 1, terms: null }]))),
    ).toThrow(/hrBlocks\[0\]\.heartRate must be a finite number/)
    expect(() =>
      parseDigest(
        edited(ride, (o) => (o.hrBlocks = [{ heartRate: 120, value: 'x', terms: null }])),
      ),
    ).toThrow(/hrBlocks\[0\]\.value must be a number or null/)
    expect(() => parseDigest(edited(ride, (o) => (o.hrBlocks = {})))).toThrow(
      /hrBlocks must be an array/,
    )
    expect(() => parseDigest(edited(ride, (o) => (o.flags = [5])))).toThrow(
      /flags\[0\] must be an object/,
    )
    expect(() =>
      parseDigest(edited(ride, (o) => (o.flags = [{ kind: 'x', start: 0, end: 1, message: 3 }]))),
    ).toThrow(/flags\[0\]\.message must be a string/)
    expect(() => parseDigest(edited(ride, (o) => (o.calibration = 4)))).toThrow(
      /calibration must be an object/,
    )
    expect(() => parseDigest(edited(ride, (o) => (o.calibration = { blocks: 1, rr: 1 })))).toThrow(
      /calibration\.ra must be a finite number/,
    )
    expect(() => parseDigest(edited(ride, (o) => (o.climbSections = [{}])))).toThrow(
      /climbSections\[0\]\.start must be an integer/,
    )
    expect(() =>
      parseDigest(
        edited(ride, (o) => {
          o.climbSections = [{ start: 0, end: 300, measuredW: 200, terms: null }]
        }),
      ),
    ).toThrow(/climbSections\[0\]\.terms must be an object/)
    expect(() => parseDigest(edited(ride, (o) => delete o.climbSections))).toThrow(
      /climbSections must be an array/,
    )
  })
})
