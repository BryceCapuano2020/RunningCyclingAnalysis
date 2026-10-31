import { describe, expect, it, vi } from 'vitest'
import { fitBikeModelOver } from './rideCurves'
import { fixedMasses, massesOf } from './masses'
import { judgedCurves } from './judgedCurves'
import { powerCheckOf, powerSetAsideIds, trustedPower } from './powerCheck'
import { AnalysisSession } from '../session'
import { PeriodCache } from '../periodCache'
import { heartRatePoints } from './rideCurves'
import { DAY, SAMPLE_DIGESTS, START, meterRide, steadyRide } from './test/powerFixtures'
import { MODEL_REVISION } from './modelRevision'
import type { ActivityDigest, AthleteSettings } from '../types'
import { DEFAULT_BIKE_MODEL } from '../constants'

vi.mock('../fitness/compute', async (original) => {
  const real = await original<typeof import('../fitness/compute')>()
  return { ...real, fitnessStatuses: vi.fn(real.fitnessStatuses) }
})

/** A digest of the current model revision, which a session takes. */
const current = (d: ActivityDigest): ActivityDigest =>
  Object.assign({}, d, { modelRevision: MODEL_REVISION })

const settings: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const masses = fixedMasses(70, 9)

describe('a ride whose power is set aside is out of every ride computation', () => {
  const plateau = steadyRide('plateau', START, 10)
  const normal = steadyRide('normal', START + DAY, 3.5)

  it('is out of the list the computations take their rides from', () => {
    expect(trustedPower([plateau, normal], masses).map((d) => d.id)).toEqual(['normal'])
    expect([...powerSetAsideIds([plateau, normal], settings)]).toEqual(['plateau'])
  })

  it('is out of the bike model’s calibration', () => {
    const library = SAMPLE_DIGESTS.filter((d) => d.calibration !== null)
    const base = fitBikeModelOver(library, masses)
    expect(base.source).toBe('calibrated')
    // A copy of a library ride whose meter reads 1.5 times too high: its blocks would bend the fit if pooled.
    const source = library[0]!
    const copy = (id: string, wkg: number): ActivityDigest => ({
      ...source,
      ...steadyRide(id, START + 400 * DAY, wkg),
      calibration: {
        ...source.calibration!,
        rP: source.calibration!.rP * 1.5,
        aP: source.calibration!.aP * 1.5,
      },
    })
    expect(fitBikeModelOver([...library, copy('wrong', 10)], masses).model).toEqual(base.model)
    // Control: the same sums on a ride that is not set aside do change it.
    expect(fitBikeModelOver([...library, copy('plausible', 3.5)], masses).model).not.toEqual(
      base.model,
    )
  })

  it('is out of the estimated-ride gate’s heart-rate lines and measured durations', () => {
    // Six measured rides with heart rate to fit a line; one more, set aside, reaches a longer duration.
    const hr = (watts: number) => 100 + watts / 4
    const rides = Array.from({ length: 6 }, (_, i) =>
      meterRide(`r${i}`, START + (i + 1) * DAY, (d) => (d <= 3600 ? 200 + i * 10 : Number.NaN), hr),
    )
    const longer = meterRide('long', START + 9 * DAY, () => 700, hr)
    const without = judgedCurves(rides, masses, DEFAULT_BIKE_MODEL, 70).gate
    const withLong = judgedCurves([...rides, longer], masses, DEFAULT_BIKE_MODEL, 70).gate
    expect(without).not.toBeNull()
    expect(Math.max(...withLong!.measuredDurations)).toBe(Math.max(...without!.measuredDurations))
    expect(withLong!.lines.size).toBe(without!.lines.size)
  })

  it('is out of the durability bests and the ride fitness readings', async () => {
    const { fitnessStatuses } = await import('../fitness/compute')
    const digests = [plateau, normal].map(current)
    const state = new AnalysisSession().loadDigests(digests, settings)
    const fresh = state.lateEvidence.ride.durability.find((row) => row.durationS === 300)
    expect(fresh?.fresh?.activityId).toBe('normal')
    const passed = vi.mocked(fitnessStatuses).mock.calls.at(-1)?.[1]
    expect(passed?.has('plateau')).toBe(true)
    expect(passed?.has('normal')).toBe(false)
  })

  it('stays in when the athlete keeps it, in the durability bests too', () => {
    const digests = [plateau, normal].map(current)
    const state = new AnalysisSession().loadDigests(digests, {
      ...settings,
      keepPower: ['plateau'],
    })
    const row = state.lateEvidence.ride.durability.find((r) => r.durationS === 300)
    expect(row?.fresh?.activityId).toBe('plateau')
  })

  it('hands the same-heart-rate reading the ids with the heart-rate list, and the drift reading the rest', () => {
    const sameHeartRate = vi.spyOn(PeriodCache.prototype, 'sameHeartRate')
    const late = vi.spyOn(PeriodCache.prototype, 'late')
    const digests = [plateau, normal].map(current)
    new AnalysisSession().loadDigests(digests, settings)
    const held = sameHeartRate.mock.calls.at(-1)?.[3]
    expect(held).toContain('plateau')
    expect(held).not.toContain('normal')
    const [drift, heldForDrift] = late.mock.calls.at(-1) ?? []
    expect(drift?.map((d) => d.id)).toEqual(['normal'])
    expect(heldForDrift).toContain('plateau')
    sameHeartRate.mockRestore()
    late.mockRestore()
  })

  it('gives no heart-rate point from its blocks', () => {
    const blocks = [{ heartRate: 150, value: 250, terms: null }]
    const withBlocks = (d: ActivityDigest): ActivityDigest =>
      Object.assign({}, d, { hrBlocks: blocks })
    const points = heartRatePoints(
      [withBlocks(plateau), withBlocks(normal)],
      masses,
      DEFAULT_BIKE_MODEL,
    )
    expect(points.ridePoints.map((p) => p.activityId)).toEqual(['normal'])
  })
})

describe('the low-for-power judgement of heart rate', () => {
  const hr = (watts: number) => 100 + watts / 4
  /** A ride of 12 activities' worth of library: steady 3.5 W/kg with a heart rate that fits its watts. */
  const library = Array.from({ length: 14 }, (_, i) => {
    const watts = 180 + i * 12
    return Object.assign(
      meterRide(`r${i}`, START + (i + 1) * DAY, () => 3.5 * 70, hr),
      {
        hasHeartRate: true,
        movingS: 3600,
        hrBlocks: [1, 2, 3, 4].map(() => ({ heartRate: hr(watts), value: watts, terms: null })),
      },
    )
  })
  /** A ride whose strap read low across the whole ride (100 bpm at 250 W), with or without a 5 s spike no rider makes. */
  const lowStrap = (id: string, spikeW: number) =>
    Object.assign(
      meterRide(id, START + 30 * DAY, (d) => (d <= 5 ? spikeW : 3.5 * 70), hr),
      {
        hasHeartRate: true,
        movingS: 3600,
        hrBlocks: [1, 2, 3, 4].map(() => ({ heartRate: 100, value: 250, terms: null })),
      },
    )

  it('judges a ride with plausible power, which is the control', () => {
    const { heart } = judgedCurves(
      [...library, lowStrap('strap', 900)],
      masses,
      DEFAULT_BIKE_MODEL,
      70,
    )
    expect(heart.setAside.has('strap')).toBe(true)
  })

  it('skips a ride whose power is set aside, leaving its heart rate otherwise trusted', () => {
    const { heart } = judgedCurves(
      [...library, lowStrap('strap', 4000)],
      masses,
      DEFAULT_BIKE_MODEL,
      70,
    )
    expect(heart.setAside.has('strap')).toBe(false)
    expect(heart.trusted.map((d) => d.id)).toContain('strap')
  })
})

describe('whether the body weight is known', () => {
  const plateau = steadyRide('plateau', START, 10)
  const dated: AthleteSettings = {
    massKg: 75,
    bikeMassKg: 9,
    massAssumed: true,
    measurements: [{ kind: 'massKg', value: 70, from: '2020-01-01' }],
  }

  it('is known from a dated mass, whatever the placeholder flag says', () => {
    expect(massesOf(dated).massKnown).toBe(true)
    expect(powerCheckOf(plateau, massesOf(dated))).toBe('set-aside')
  })

  it('is not known from a placeholder alone', () => {
    expect(massesOf({ massKg: 75, bikeMassKg: 9, massAssumed: true }).massKnown).toBe(false)
    expect(massesOf({ massKg: 75, bikeMassKg: 9 }).massKnown).toBe(true)
  })
})
