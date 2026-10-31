import { describe, expect, it } from 'vitest'
import { ridePowerCeilingWkg } from '../curves'
import { NO_EFFORT_REFERENCE } from '../effort'
import type { EffortReference } from '../effort'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { activitySummaries } from './activitySummaries'
import { MODEL_REVISION } from './modelRevision'
import { POWER_HEART_RATE_MIN_S, powerHeartRateOf, rideReferenceOf } from './powerEvidence'

const BODY_KG = 75
const REFERENCE = 190

/** A measured power point of `wkg` per kilo at a duration, with the heart rate over its window. */
function point(durationS: number, wkg: number, heartRate: number | null): DigestCurvePoint {
  return {
    durationS,
    value: wkg * BODY_KG,
    startIndex: 0,
    windowS: durationS,
    heartRate,
    terms: null,
  }
}

describe('powerHeartRateOf', () => {
  const over = (durationS: number) => ridePowerCeilingWkg(durationS) * 1.1

  it('reads the heart rate over the longest effort above the ceiling, as a share of the reference', () => {
    const curve = [point(300, over(300), 150), point(1200, over(1200), 171), point(60, 20, 120)]
    const found = powerHeartRateOf({ curve }, BODY_KG, REFERENCE)
    expect(found).toMatchObject({ durationS: 1200 })
    expect(found?.heartRateShare).toBeCloseTo(0.9, 9)
    expect(found?.wkg).toBeCloseTo(over(1200), 9)
  })

  it('leaves efforts too short for heart rate to follow, ones under the ceiling, and ones with no heart rate', () => {
    expect(
      powerHeartRateOf({ curve: [point(POWER_HEART_RATE_MIN_S - 1, 30, 150)] }, BODY_KG, REFERENCE),
    ).toBeUndefined()
    expect(
      powerHeartRateOf({ curve: [point(1200, over(1200) / 1.5, 171)] }, BODY_KG, REFERENCE),
    ).toBeUndefined()
    expect(
      powerHeartRateOf({ curve: [point(1200, over(1200), null)] }, BODY_KG, REFERENCE),
    ).toBeUndefined()
  })

  it('needs a reference to read against', () => {
    const curve = [point(1200, over(1200), 171)]
    expect(powerHeartRateOf({ curve }, BODY_KG, null)).toBeUndefined()
  })

  it('does not judge a point priced from slope and speed', () => {
    const virtual = {
      ...point(1200, over(1200), 171),
      terms: { gravityAccel: 1, rolling: 1, aero: 1 },
    }
    expect(powerHeartRateOf({ curve: [virtual] }, BODY_KG, REFERENCE)).toBeUndefined()
  })
})

describe('rideReferenceOf', () => {
  const withReading = (reading: EffortReference['reading']['ride']): EffortReference => ({
    ...NO_EFFORT_REFERENCE,
    referenceHr: { run: null, ride: REFERENCE },
    reading: { run: null, ride: reading },
  })

  it('is the ride reference only when it can stand for a maximum', () => {
    expect(rideReferenceOf(withReading('trusted'))).toBe(REFERENCE)
    for (const reading of ['low', 'habitual', 'high', 'thin', null] as const) {
      expect(rideReferenceOf(withReading(reading))).toBeNull()
    }
  })
})

describe('activitySummaries and the heart rate over a ride’s power', () => {
  const ride = {
    version: 1,
    modelRevision: MODEL_REVISION,
    id: 'ride',
    name: 'ride',
    sport: 'ride',
    startMs: Date.UTC(2025, 5, 1),
    durationS: 4000,
    distanceM: 40000,
    elevationGainM: 0,
    hasHeartRate: true,
    indoor: false,
    powerSource: 'measured',
    flags: [],
    flagCounts: {},
    maxHeartRate: 190,
    curve: [point(1200, ridePowerCeilingWkg(1200) * 1.1, 171)],
    hrBlocks: [],
  } as unknown as ActivityDigest
  const settings = { massKg: BODY_KG, bikeMassKg: 9 }

  it('carries the reading on a ride whose power is set aside, when a reference is given', () => {
    const [summary] = activitySummaries([ride], settings, REFERENCE)
    expect(summary).toMatchObject({ powerCheck: 'set-aside', powerHeartRate: { durationS: 1200 } })
  })

  it('carries none without a reference, and none for a ride that is not in question', () => {
    const [bare] = activitySummaries([ride], settings)
    expect(bare).toMatchObject({ powerCheck: 'set-aside' })
    expect(bare).not.toHaveProperty('powerHeartRate')
    const fine = { ...ride, curve: [point(1200, 3, 171)] } as ActivityDigest
    const [plain] = activitySummaries([fine], settings, REFERENCE)
    expect(plain).not.toHaveProperty('powerCheck')
    expect(plain).not.toHaveProperty('powerHeartRate')
  })
})
