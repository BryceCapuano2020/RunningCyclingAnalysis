import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL, HEADLINE_DURATION_S } from '../constants'
import { combine } from '../digest/combine'
import { metabolicToFlatSpeed } from '../metabolic'
import type { ActivityDigest, Sport } from '../types'
import { changeEvidence } from './evidence'
import { nullBand } from './null'
import { readingsOf } from './readings'
import { PeriodCache } from '../periodCache'
import { callAt, verdictAt } from './types'
import { effortLibrary, MONDAY, SETTINGS } from './test/library'
import type { Spec } from './test/library'

const WEEKS = 12
const CUT = MONDAY + WEEKS * 7 * DAY_MS

/** Two periods of a library: the second at `lift` (a log change) above the first. */
function periods(over: Partial<Spec> & { sport: Sport }, lift: number) {
  const library = effortLibrary({
    perWeek: 4,
    weeks: 2 * WEEKS,
    seed: 3,
    level: (week) => (week >= WEEKS ? lift : 0),
    ...over,
  })
  return {
    library,
    selected: library.filter((d) => d.startMs >= CUT),
    previous: library.filter((d) => d.startMs < CUT),
  }
}

const evidenceOf = ({
  selected,
  previous,
}: {
  selected: ActivityDigest[]
  previous: ActivityDigest[]
}) => changeEvidence(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null)

describe('nullBand', () => {
  const pooled = Float64Array.from({ length: 24 }, (_, i) => 24 - i)

  it('is symmetric about zero for two sides of one size, and wide enough to hold most deals', () => {
    const band = nullBand(pooled, 12, 1)!
    expect(band.low).toBeLessThan(0)
    expect(band.high).toBeGreaterThan(0)
    expect(band.high + band.low).toBeCloseTo(0, 1)
  })

  it('puts a larger side higher: its expected best is the higher, and the band prices that in', () => {
    const band = nullBand(pooled, 18, 1)!
    expect(band.low + band.high).toBeGreaterThan(0.05)
  })

  it('is the same for the same seed, and null when a side is empty', () => {
    expect(nullBand(pooled, 12, 7)).toEqual(nullBand(pooled, 12, 7))
    expect(nullBand(pooled, 0, 7)).toBeNull()
    expect(nullBand(pooled, 24, 7)).toBeNull()
  })
})

describe('readingsOf', () => {
  it('has the highest reading of a period at a length be the best the analysis gives there, for both sports', () => {
    for (const sport of ['run', 'ride'] as const) {
      const { library } = periods({ sport }, 0)
      const readings = readingsOf(library, SETTINGS, DEFAULT_BIKE_MODEL, null)
      const index = readings[sport].findIndex((r) => r.values.length > 0)
      expect(index).toBeGreaterThanOrEqual(0)
      const analysis = combine(library, SETTINGS)
      const curve = sport === 'run' ? analysis.runCurve : analysis.rideMetabolicCurve
      for (const [i, { values }] of readings[sport].entries()) {
        if (values.length === 0) continue
        const point = curve[i]!
        // A run is compared in flat speed and a ride in W/kg, which are the curves' own values under the same conversion.
        const expected = sport === 'run' ? metabolicToFlatSpeed(point.value) : point.value
        expect(Math.max(...values)).toBeCloseTo(expected, 6)
      }
    }
  })

  it('leaves out a treadmill run, which holds no best', () => {
    const { library } = periods({ sport: 'run' }, 0)
    const indoor = library.map((d) => Object.assign({}, d, { indoor: true }))
    const readings = readingsOf(indoor, SETTINGS, DEFAULT_BIKE_MODEL, null)
    expect(readings.run.every((r) => r.values.length === 0)).toBe(true)
  })
})

describe('changeEvidence', () => {
  it('calls a planted gain higher, a planted loss lower, and the same capability none', () => {
    const up = verdictAt(
      evidenceOf(periods({ sport: 'ride', spread: 0.02 }, 0.15)),
      'ride',
      HEADLINE_DURATION_S,
    )
    const down = verdictAt(
      evidenceOf(periods({ sport: 'ride', spread: 0.02 }, -0.15)),
      'ride',
      HEADLINE_DURATION_S,
    )
    const same = verdictAt(
      evidenceOf(periods({ sport: 'ride', spread: 0.02 }, 0)),
      'ride',
      HEADLINE_DURATION_S,
    )
    expect(up).toBe('higher')
    expect(down).toBe('lower')
    expect(same).toBe('none')
  })

  it('reports the counts, the observed ratio and the band behind a call', () => {
    const call = callAt(
      evidenceOf(periods({ sport: 'run', spread: 0.02 }, 0.15)),
      'run',
      HEADLINE_DURATION_S,
    )!
    expect(call.now).toBeGreaterThanOrEqual(4)
    expect(call.before).toBeGreaterThanOrEqual(4)
    expect(call.observed).toBeGreaterThan(call.high!)
    expect(call.low!).toBeLessThan(0)
  })

  it('says untested where a period has too few efforts of the length, however large the gap', () => {
    const sparse = periods({ sport: 'run', perWeek: 0.3 }, 0.3)
    const call = callAt(evidenceOf(sparse), 'run', HEADLINE_DURATION_S)!
    expect(call.verdict).toBe('untested')
    expect(call.low).toBeNull()
  })

  it('says untested for a sport the library lacks', () => {
    expect(verdictAt(evidenceOf(periods({ sport: 'run' }, 0.1)), 'ride', HEADLINE_DURATION_S)).toBe(
      'untested',
    )
  })

  it('reads a ride at the weight it was ridden at: the same watts at a lighter weight is a gain in W/kg', () => {
    const base = periods({ sport: 'ride', spread: 0.02 }, 0)
    const dated = {
      ...SETTINGS,
      measurements: [
        { kind: 'massKg' as const, value: 80, from: '2000-01-01' },
        { kind: 'massKg' as const, value: 70, from: new Date(CUT).toISOString().slice(0, 10) },
      ],
    }
    const heavy = changeEvidence(base.selected, base.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    const light = changeEvidence(base.selected, base.previous, dated, DEFAULT_BIKE_MODEL, null)
    expect(verdictAt(heavy, 'ride', HEADLINE_DURATION_S)).toBe('none')
    expect(verdictAt(light, 'ride', HEADLINE_DURATION_S)).toBe('higher')
  })

  it('is the same on a second call: the draws are seeded', () => {
    const p = periods({ sport: 'run' }, 0.05)
    expect(evidenceOf(p)).toEqual(evidenceOf(p))
  })
})

describe('PeriodCache.change', () => {
  const p = periods({ sport: 'run' }, 0.05)

  it('keeps the evidence for the same periods, masses and gate, and redoes it for others', () => {
    const cache = new PeriodCache()
    const first = cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    expect(cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)).toBe(first)
    expect(
      cache.change(p.selected, p.previous.slice(1), SETTINGS, DEFAULT_BIKE_MODEL, null),
    ).not.toBe(first)
  })

  it('keeps a few periods, so going back to one just shown costs nothing', () => {
    const cache = new PeriodCache()
    const first = cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    cache.change(p.selected.slice(1), p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    cache.change(p.selected.slice(2), p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    expect(cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)).toBe(first)
  })

  it('finds an entry only for the reading rule it was made through', () => {
    const cache = new PeriodCache()
    const first = cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    const gated = { rule: { activity: () => true, point: () => false }, key: 'nothing counts' }
    const other = cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null, gated)
    expect(other).not.toBe(first)
    // Nothing counts under the rule, so the call falls back to every effort in both periods: the same as without one.
    expect(other).toEqual(first)
    expect(other.run.every((call) => !call.gated)).toBe(true)
  })

  it('lets go of the change test and the previous curves of a digest the library no longer holds', () => {
    const cache = new PeriodCache()
    const first = cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    cache.releaseAbsent([...p.selected, ...p.previous])
    expect(cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)).toBe(first)
    cache.releaseAbsent(p.selected)
    expect(cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)).not.toBe(first)
  })
})
