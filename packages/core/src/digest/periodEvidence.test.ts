import { describe, expect, it } from 'vitest'
import type { ActivityDigest, DigestDrift, Sport } from '../types'
import { driftTrend } from './driftTrend'
import { periodDurability } from './durabilityPeriod'
import { digestActivity } from './digestActivity'
import { syntheticActivity } from './test/syntheticActivity'

const base = (sport: Sport, power?: Float64Array) =>
  digestActivity(syntheticActivity({ n: 120, sport, power }))

/** A digest of `sport` with the given fresh values for 300 s and 1200 s, and durability points. */
function digestWith(
  id: string,
  sport: Sport,
  fresh: [number, number],
  after: [number, number, number][],
  overrides: Partial<ActivityDigest> = {},
): ActivityDigest {
  const digest = base(sport, sport === 'ride' ? new Float64Array(120).fill(200) : undefined)
  const curve = digest.curve.map((p) => {
    const value = p.durationS === 300 ? fresh[0] : p.durationS === 1200 ? fresh[1] : NaN
    return { ...p, value }
  })
  return {
    ...digest,
    id,
    curve,
    durability: after.map(([afterS, durationS, value]) => ({ afterS, durationS, value })),
    ...overrides,
  }
}

describe('periodDurability', () => {
  const a = digestWith(
    'a',
    'ride',
    [320, 280],
    [
      [3600, 300, 300],
      [3600, 1200, 260],
      [5400, 300, 250],
    ],
  )
  const b = digestWith(
    'b',
    'ride',
    [300, 270],
    [
      [3600, 300, 310],
      [3600, 1200, 255],
    ],
  )
  const old = { ...digestWith('old', 'ride', [400, 350], []), durability: undefined }
  const rows = periodDurability([a, b, old], 'ride')

  it('has a row for each durability duration, with the fresh best and one entry for each time', () => {
    expect(rows.map((r) => r.durationS)).toEqual([300, 1200])
    expect(rows[0]!.after.map((x) => x.afterS)).toEqual([3600, 5400, 7200])
  })

  it('takes the best fresh output of any activity, and counts the activities that have one', () => {
    expect(rows[0]!.fresh).toEqual({ value: 400, activityId: 'old', supporters: 3 })
  })

  it('takes the best after output with the activities that support it, and the retention against fresh', () => {
    const at3600 = rows[0]!.after[0]!
    expect(at3600.best).toEqual({ value: 310, activityId: 'b', supporters: 2 })
    expect(at3600.retention).toBeCloseTo(310 / 400, 12)
    expect(rows[0]!.after[1]!.best).toEqual({ value: 250, activityId: 'a', supporters: 1 })
  })

  it('has no best, and no retention, where no activity supports a time', () => {
    expect(rows[0]!.after[2]).toEqual({ afterS: 7200, best: null, retention: null })
  })

  it('leaves out rides without a power meter and the other sport', () => {
    const estimated = digestWith('virtual', 'ride', [999, 999], [[3600, 300, 999]], {
      powerSource: 'virtual',
    })
    const run = digestWith('run', 'run', [14, 13], [[3600, 300, 12]])
    expect(periodDurability([a, estimated, run], 'ride')[0]!.fresh!.supporters).toBe(1)
    const runs = periodDurability([a, estimated, run], 'run')
    expect(runs[0]!.fresh).toEqual({ value: 14, activityId: 'run', supporters: 1 })
    expect(runs[0]!.after[0]!.best!.value).toBe(12)
  })

  it('does not count a run faster than the world-record ceiling', () => {
    const impossible = digestWith('fast', 'run', [100, 90], [[3600, 300, 100]])
    const row = periodDurability([impossible], 'run')[0]!
    expect(row.fresh).toBeNull()
    expect(row.after[0]!.best).toBeNull()
  })

  it('is empty-handed with no digests', () => {
    expect(periodDurability([], 'run')[0]).toEqual({
      durationS: 300,
      fresh: null,
      after: [3600, 5400, 7200].map((afterS) => ({ afterS, best: null, retention: null })),
    })
  })
})

describe('driftTrend', () => {
  const drift = (first: number, second: number): DigestDrift => ({
    firstRatio: first,
    secondRatio: second,
    durationS: 3000,
  })
  const run = (id: string, startMs: number, d?: DigestDrift | null) => ({
    ...base('run'),
    id,
    startMs,
    ...(d === undefined ? {} : { drift: d }),
  })

  it('lists the steady efforts of the sport earliest first, with the decoupling in percent', () => {
    const points = driftTrend(
      [
        run('late', 30, drift(0.1, 0.09)),
        run('early', 10, drift(0.1, 0.1)),
        run('none', 20, null),
        run('old', 5),
      ],
      'run',
    )
    expect(points.map((p) => p.activityId)).toEqual(['early', 'late'])
    expect(points[0]!.decouplingPct).toBe(0)
    expect(points[1]!.decouplingPct).toBeCloseTo(10, 12)
  })

  it('reads negative decoupling where the second half was cheaper', () => {
    expect(driftTrend([run('a', 1, drift(0.1, 0.11))], 'run')[0]!.decouplingPct).toBeCloseTo(
      -10,
      12,
    )
  })

  it('leaves out the other sport', () => {
    expect(driftTrend([run('a', 1, drift(0.1, 0.09))], 'ride')).toEqual([])
  })
})
