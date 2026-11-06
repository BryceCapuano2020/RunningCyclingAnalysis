import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { MONDAY } from '../digest/test/sameHeartRateFixture'
import type { ActivityDigest } from '../types'
import { fitnessStatuses } from './compute'
import { fitnessLines } from './copy'
import { earlyTrendOf } from './early'
import { rideLibrary } from './test/rideSim'

const NONE: ReadonlySet<string> = new Set()
const WEEK_MS = 7 * DAY_MS
const NOISE = { rideSd: 0.02, blockSd: 0.035 } as const

const status = (digests: ActivityDigest[]) =>
  fitnessStatuses(digests, NONE, { enabled: { ride: true } }).ride

/** Rides before week `meter` carry virtual power, as a rider's do before a power meter. */
const withMeterFrom = (digests: ActivityDigest[], meter: number): ActivityDigest[] =>
  digests.map((d) =>
    d.startMs < MONDAY + meter * WEEK_MS ? { ...d, powerSource: 'virtual' as const } : d,
  )

/** The calibration library: 130 weeks at two a week, the last 12 on the meter, a 5% rise across them. */
const rising = () =>
  withMeterFrom(
    rideLibrary({
      weeks: 130,
      perWeek: 2,
      seed: 1,
      ...NOISE,
      planted: (w) => Math.log1p(0.05 * Math.max(0, Math.min(1, (w - 117) / 12))),
    }),
    118,
  )

describe('the early trend of a ride with a new power meter', () => {
  // The spec's fixed-seed figure: +4.21% (-0.94% to +9.63%), to 0.01 points. The rise runs over weeks 117 to 129, the meter from 118.
  it('reads the newest six steady rides against the first six: the fixed-seed golden', () => {
    const s = status(rising())
    expect(s.state).toBe('not-enough-evidence')
    expect(s.shortfall?.kind).toBe('history')
    expect(s.steady).toBe(24)
    const e = s.early!
    expect(Math.abs(e.change.value - 0.0421)).toBeLessThan(0.0001)
    expect(Math.abs(e.change.low + 0.0094)).toBeLessThan(0.0001)
    expect(Math.abs(e.change.high - 0.0963)).toBeLessThan(0.0001)
    expect([e.first.runs, e.newest.runs]).toEqual([6, 6])
    expect((e.newest.fromMs - e.first.fromMs) / DAY_MS).toBe(63)
    expect(e.first.heartRate).toBe(145)
  })

  it('floors the range once for each group: wider than the app’s one-floor range', () => {
    const e = status(rising()).early!
    const half = Math.log((1 + e.change.high) / (1 + e.change.low)) / 2
    // 1.645 * sqrt(se1^2 + se2^2 + 2 * 0.02^2) with a sigma of 4.5% or less never goes under the two floors alone.
    expect(half).toBeGreaterThan(1.645 * Math.sqrt(2) * 0.02)
  })

  it('ignores rides with modelled power: more of them change nothing it says', () => {
    const before = status(rising()).early
    const extra = rideLibrary({
      weeks: 130,
      perWeek: 2,
      seed: 9,
      ...NOISE,
      planted: () => 0.3,
    }).map((d) => Object.assign({}, d, { id: `virtual-${d.id}`, powerSource: 'virtual' as const }))
    expect(status([...rising(), ...extra]).early).toEqual(before)
  })

  it('says why a ride on modelled power only is not compared', () => {
    const modelled = withMeterFrom(rideLibrary({ weeks: 20, perWeek: 2, seed: 1, ...NOISE }), 20)
    const s = status(modelled)
    expect(s.steady).toBe(0)
    expect(s.virtualOnly).toBe(true)
    expect(s.early).toBeUndefined()
    expect(fitnessLines(s, 'metric')).toEqual({
      headline: 'No outdoor rides with a power meter and heart rate yet.',
      changes: [],
      support: '',
      needs: '',
      early: ['Power worked out from speed moves with wind and drafting, so it is not compared.'],
    })
    expect(
      status(withMeterFrom(rideLibrary({ weeks: 20, perWeek: 2, seed: 1, ...NOISE }), 0))
        .virtualOnly,
    ).toBeUndefined()
  })

  it('has none under six steady rides, and says how many more it needs', () => {
    const few = rideLibrary({ weeks: 40, perWeek: 2, seed: 1, ...NOISE })
    const s = status(withMeterFrom(few, 38))
    expect(s.steady).toBe(6 - 2)
    expect(s.early).toBeUndefined()
    expect(fitnessLines(s, 'metric').needs).toBe(
      '2 more power-meter rides with heart rate for an early trend.',
    )
  })

  it('shrinks the groups until their median days are two weeks apart, and has none when they cannot be', () => {
    const rides = (days: number[]) => days.map((t) => ({ id: `r${t}`, t, x: Math.log(200) }))
    const apart = earlyTrendOf(rides([0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17]), 20)!
    expect([apart.first.runs, apart.newest.runs]).toEqual([4, 4])
    expect(earlyTrendOf(rides([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 20)).toBeNull()
  })

  it('reads a rider back after 60 weeks from the return, not from the years before', () => {
    const all = rideLibrary({ weeks: 113, perWeek: 2, seed: 3, ...NOISE })
    const kept = all.filter(
      (d) => d.startMs < MONDAY + 31 * WEEK_MS || d.startMs >= MONDAY + 100 * WEEK_MS,
    )
    const e = status(kept).early!
    expect(e.first.fromMs).toBeGreaterThanOrEqual(MONDAY + 100 * WEEK_MS)
  })

  it('is absent once the monitor has a baseline, and the state is the monitor’s', () => {
    const full = status(rideLibrary({ weeks: 130, perWeek: 2, seed: 1, ...NOISE }))
    expect(full.early).toBeUndefined()
    expect(full.state).toBe('holding')
    expect(full.shortfall).toBeNull()
  })

  it('is never offered to a run', () => {
    const runs = fitnessStatuses(
      rideLibrary({ weeks: 10, perWeek: 2, seed: 1, ...NOISE }).map((d) =>
        Object.assign({}, d, { sport: 'run' as const }),
      ),
      NONE,
    ).run
    expect(runs.early).toBeUndefined()
  })
})

describe('the early trend in words', () => {
  const lines = fitnessLines(status(rising()), 'metric')

  it('tells the signed estimate and its range, and the two groups', () => {
    expect(lines.early).toEqual([
      expect.stringMatching(/^\+4% on your first power-meter rides, \d+ \w+ \(-1% to \+10%\)\.$/),
      expect.stringMatching(/^First: 6 rides, \d+ \w+ to \d+ \w+, 145 bpm median\.$/),
      expect.stringMatching(/^Newest: 6 rides, \d+ \w+ to \d+ \w+, 145 bpm median\.$/),
      'A season, the weather and a change of meter move this figure until the full trend.',
    ])
  })

  it('keeps the level as the headline and tells what the full trend needs', () => {
    expect(lines.headline).toMatch(/^\d+ W \(\d+ to \d+\) at 145 bpm\.$/)
    expect(lines.needs).toMatch(
      /^The full trend starts once 12 power-meter rides over 8 different weeks are 8 weeks old\. \d+ so far\.$/,
    )
    expect(lines.changes).toEqual([])
  })

  it('names no direction, no cause and no hedge', () => {
    const text = [...lines.early!, lines.needs].join(' ')
    expect(text).not.toMatch(/\b(up|down|rising|falling|because|caused|may|might|about)\b|—/i)
  })

  it('says power-meter rides, never earlier rides, in every ride shortfall', () => {
    const base = status(rising())
    const needs = (shortfall: NonNullable<typeof base.shortfall>) =>
      fitnessLines({ ...base, early: undefined, steady: 30, shortfall }, 'metric').needs
    expect(needs({ kind: 'history', have: 9, need: 12, weeks: 8, needWeeks: 8 })).toBe(
      '3 more power-meter rides to see a trend.',
    )
    expect(needs({ kind: 'history', have: 12, need: 12, weeks: 5, needWeeks: 8 })).toBe(
      'Power-meter rides over 8 different weeks to see a trend.',
    )
    expect(needs({ kind: 'history', have: 12, need: 12, weeks: 8, needWeeks: 8 })).toBe(
      'More power-meter rides to see a trend.',
    )
  })
})
