import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import type { ActivityDigest } from '../types'
import { fitGrade } from './fit'
import { runReadings } from './runReadings'
import { rideSeries } from './rideUnit'
import { runSeries } from './unit'
import { km, runDigest, START, steadyLibrary } from './test/runDigest'
import { withBlocks } from '../digest/test/sameHeartRateFixture'

const NONE: ReadonlySet<string> = new Set()
const series = (digests: ActivityDigest[], setAside: ReadonlySet<string> = NONE) =>
  runSeries(digests, 'run', setAside)

const eightKm = (over: Parameters<typeof km>[0] = {}) => Array.from({ length: 8 }, () => km(over))

describe('the kilometres a run offers', () => {
  it('leaves out kilometre 1 and everything past kilometre 10', () => {
    const splits = Array.from({ length: 12 }, (_, i) => km({ avgHeartRate: 100 + i }))
    const readings = runReadings(runDigest({ id: 'a', startMs: START, km: splits }), 'run')!
    expect(readings.loose.map((k) => k.hr)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109])
  })

  it('leaves out a partial kilometre, a climb and a kilometre without a heart rate or time', () => {
    const splits = [
      km(),
      km({ distanceM: 400 }),
      km({ elevationGainM: 26 }),
      km({ avgHeartRate: null }),
      km({ seconds: null }),
      km({ grade: 0.2 }),
      km(),
      km(),
    ]
    const readings = runReadings(runDigest({ id: 'a', startMs: START, km: splits }), 'run')!
    expect(readings.loose).toHaveLength(2)
  })

  it('takes a run whose pace holds from kilometre to kilometre, not one that swings 8%', () => {
    const swing = (change: number) =>
      Array.from({ length: 9 }, (_, i) => km({ seconds: 300 * (i % 2 === 0 ? 1 : 1 + change) }))
    const steady = runReadings(runDigest({ id: 'a', startMs: START, km: swing(0.03) }), 'run')!
    const wandering = runReadings(runDigest({ id: 'b', startMs: START, km: swing(0.08) }), 'run')!
    expect(steady.steadyPace).toBe(true)
    expect(wandering.steadyPace).toBe(false)
  })

  it('needs three changes of pace to judge, and counts whole kilometres only', () => {
    const short = Array.from({ length: 4 }, () => km())
    expect(runReadings(runDigest({ id: 'a', startMs: START, km: short }), 'run')!.steadyPace).toBe(
      false,
    )
    const partial = [...Array.from({ length: 4 }, () => km()), km({ distanceM: 300, seconds: 40 })]
    expect(
      runReadings(runDigest({ id: 'b', startMs: START, km: partial }), 'run')!.steadyPace,
    ).toBe(false)
  })

  it('refuses indoor runs, walking pace, no heart rate, spike and dropout flags, other sports', () => {
    const base = { id: 'a', startMs: START, km: eightKm() }
    expect(runReadings(runDigest({ ...base, over: { indoor: true } }), 'run')).toBeNull()
    expect(runReadings(runDigest({ ...base, over: { walkingPace: true } }), 'run')).toBeNull()
    expect(runReadings(runDigest({ ...base, over: { hasHeartRate: false } }), 'run')).toBeNull()
    expect(
      runReadings(runDigest({ ...base, over: { flagCounts: { 'hr-spike': 2 } } }), 'run'),
    ).toBeNull()
    expect(
      runReadings(runDigest({ ...base, over: { flagCounts: { 'hr-dropout': 1 } } }), 'run'),
    ).toBeNull()
    expect(runReadings(runDigest(base), 'ride')).toBeNull()
    expect(runReadings(runDigest(base), 'run')).not.toBeNull()
  })

  it('keeps the strict kilometres to flat ones that follow a steady heart rate and pace', () => {
    const splits = [
      km(),
      km({ avgHeartRate: 150 }),
      km({ avgHeartRate: 159 }), // 9 bpm up from the one before
      km({ avgHeartRate: 160 }),
      km({ seconds: 330, avgHeartRate: 160 }), // 10% slower than the one before
      km({ elevationGainM: 21, avgHeartRate: 160 }), // climbs 21 m
      km({ grade: 0.07, avgHeartRate: 160 }), // 7% credit
      km({ avgHeartRate: 160 }),
    ]
    const readings = runReadings(runDigest({ id: 'a', startMs: START, km: splits }), 'run')!
    expect(readings.loose).toHaveLength(7)
    expect(readings.strict.map((k) => k.hr)).toEqual([150, 160, 160])
  })
})

describe('the value of a run', () => {
  const library = steadyLibrary(60)

  it('qualifies runs with two kilometres in the band, not one', () => {
    const outside = (hr: number) => km({ avgHeartRate: hr })
    const two = [km(), km(), km(), km(), outside(190), outside(190), outside(190), outside(190)]
    const one = [
      km(),
      km(),
      outside(190),
      outside(190),
      outside(190),
      outside(190),
      outside(190),
      outside(190),
    ]
    const result = series([
      ...library,
      runDigest({ id: 'two', startMs: START + 2 * DAY_MS, km: two }),
      runDigest({ id: 'one', startMs: START + 3 * DAY_MS, km: one }),
    ])
    const ids = new Set(result.points.map((p) => p.id))
    expect(ids.has('two')).toBe(true)
    expect(ids.has('one')).toBe(false)
  })

  it('leaves out set-aside heart rates', () => {
    const ids = (s: ReadonlySet<string>) => series(library, s).points.map((p) => p.id)
    expect(ids(NONE)).toContain('r3')
    expect(ids(new Set(['r3']))).not.toContain('r3')
  })

  it('takes the median of the kilometres, so a 3-of-7 cadence lock moves nothing', () => {
    const clean = () => Array.from({ length: 8 }, () => km({ avgHeartRate: 150 }))
    const locked = clean().map((k, i) =>
      i >= 2 && i <= 4 ? Object.assign({}, k, { avgHeartRate: 168 }) : k,
    )
    const result = series([
      ...library,
      runDigest({ id: 'twin', startMs: START + 1 * DAY_MS, km: clean() }),
      runDigest({ id: 'lock', startMs: START + 1.5 * DAY_MS, km: locked }),
    ])
    const x = (id: string) => result.points.find((p) => p.id === id)!.x
    expect(x('lock')).toBeCloseTo(x('twin'), 12)
  })

  it('gives the same series for the digests in any order', () => {
    const shuffled = [...library].reverse().sort((a, b) => (a.id < b.id ? 1 : -1))
    expect(series(shuffled)).toEqual(series(library))
  })

  it('reads the reference heart rate from the newest year, to the nearest 5 bpm', () => {
    const old = steadyLibrary(40, { seed: 2 }).map((d) =>
      Object.assign({}, d, {
        startMs: d.startMs - 400 * DAY_MS,
        splits: {
          mile: [],
          km: d.splits!.km.map((k) => Object.assign({}, k, { avgHeartRate: 130 })),
        },
      }),
    )
    const result = series([...old, ...library])
    expect(result.referenceHr).toBe(150)
    // All time would put it near 140: the old runs do not move it.
    expect(
      series([...old, ...old.map((d) => Object.assign({}, d, { id: `${d.id}b` }))]).referenceHr,
    ).toBe(130)
  })
})

describe('the grade fit', () => {
  const hilly = steadyLibrary(80, { hilly: true, passThrough: 0.3, seed: 3 })

  it('recovers a planted pass-through of 0.3 to within 0.1', () => {
    const result = series(hilly)
    expect(result.method.tier).toBe('steady-pace')
    expect(result.method.gradePassThrough).toBeGreaterThan(0.2)
    expect(result.method.gradePassThrough).toBeLessThan(0.4)
    expect(result.method.speedPerBpm).toBeGreaterThan(0.003)
    expect(result.method.speedPerBpm).toBeLessThan(0.005)
  })

  it('takes the whole credit, and plain grade-adjusted speed, with no grade to fit', () => {
    const flat = steadyLibrary(80, { seed: 4 })
    const result = series(flat)
    expect(result.method.gradePassThrough).toBe(1)
    const ref = result.referenceHr!
    const beta = result.method.speedPerBpm
    const point = result.points.find((p) => p.id === 'r5')!
    const kms = runReadings(flat[5]!, 'run')!.loose.filter((k) => Math.abs(k.hr - ref) <= 20)
    const values = kms.map((k) => k.lnClock + k.credit - beta * (k.hr - ref)).sort((a, b) => a - b)
    const mid = values.length >> 1
    const median = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2
    expect(point.x).toBeCloseTo(median, 12)
  })

  it('is unstable with too few kilometres or a pass-through far outside 0 to 1', () => {
    const fewer = (n: number) =>
      hilly.slice(0, n).map((d) => ({ startMs: d.startMs, kms: runReadings(d, 'run')!.loose }))
    expect(fitGrade(fewer(10)).stable).toBe(false)
    expect(fitGrade(fewer(80)).stable).toBe(true)
    // A library where the clock gains 1.2 per unit of credit, which no real library does.
    const wild = steadyLibrary(80, { hilly: true, passThrough: -1.2, seed: 5 })
    expect(series(wild).method.tier).toBe('strict')
  })
})

describe('the strict unit, read when the fit is unstable', () => {
  it('reads a thin library by flat kilometres with a steady heart rate', () => {
    const thin = steadyLibrary(30, { seed: 6 })
    const steadyBpm = (hr: number) => Array.from({ length: 8 }, () => km({ avgHeartRate: hr }))
    const jumpy = Array.from({ length: 8 }, (_, i) => km({ avgHeartRate: i % 2 === 0 ? 142 : 152 }))
    const result = series([
      ...thin,
      runDigest({ id: 'steady', startMs: START + DAY_MS, km: steadyBpm(150) }),
      runDigest({ id: 'jumpy', startMs: START + 2 * DAY_MS, km: jumpy }),
    ])
    expect(result.method.tier).toBe('strict')
    expect(result.method.gradePassThrough).toBe(1)
    const ids = new Set(result.points.map((p) => p.id))
    expect(ids.has('steady')).toBe(true)
    expect(ids.has('jumpy')).toBe(false)
  })
})

describe('rides', () => {
  const ride = (id: string, day: number, over: Partial<ActivityDigest> = {}, hr = 140) =>
    withBlocks(
      'ride',
      id,
      START + day * DAY_MS,
      [0, 1, 2].map((i) => ({ heartRate: hr + i, output: 180 + i })),
      { hasHeartRate: true, flagCounts: {}, ...over },
    )

  it('reads measured power from blocks within 20 bpm of the reference, two or more of them', () => {
    const rides = [
      ride('a', 1),
      ride('b', 2),
      ride('virtual', 3, { powerSource: 'virtual' }),
      ride('spiked', 4, { flagCounts: { 'hr-spike': 1 } }),
      ride('far', 5, {}, 200),
      ride('terms', 6, {
        hrBlocks: [
          { heartRate: 140, value: 180, terms: { gravityAccel: 1, rolling: 1, aero: 1 } },
          { heartRate: 141, value: 180, terms: { gravityAccel: 1, rolling: 1, aero: 1 } },
        ],
      }),
    ]
    const result = rideSeries(rides, 'ride', NONE)
    expect(result.points.map((p) => p.id)).toEqual(['a', 'b'])
    expect(result.referenceHr).toBe(140)
    expect(Math.exp(result.points[0]!.x)).toBeGreaterThan(150)
    expect(result.method.tier).toBe('power')
  })

  it('has nothing without a measured ride', () => {
    expect(rideSeries([ride('v', 1, { powerSource: 'virtual' })], 'ride', NONE).points).toEqual([])
  })
})
