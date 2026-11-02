import { describe, expect, it } from 'vitest'
import type { ActivityDigest, DigestDrift, Sport } from '../types'
import { digestActivity } from './digestActivity'
import { lateEvidence } from './lateEvidence'
import type { LateReference } from './lateEvidence'
import type { EffortReference } from '../effort'
import { NO_LATE_EVIDENCE } from './lateEvidenceTypes'
import { syntheticActivity } from './test/syntheticActivity'

const DRIFT: DigestDrift = { firstRatio: 1, secondRatio: 0.97, durationS: 4000 }

function digestOf(id: string, sport: Sport, drift: DigestDrift | null): ActivityDigest {
  return { ...digestActivity(syntheticActivity({ n: 120, sport })), id, drift }
}

describe('lateEvidence', () => {
  it('has the drift of each sport’s steady efforts, and none for the other sport', () => {
    const evidence = lateEvidence(
      [digestOf('r1', 'run', DRIFT), digestOf('r2', 'run', null), digestOf('b1', 'ride', DRIFT)],
      new Set(),
    )
    expect(evidence.run.drift.map((p) => p.activityId)).toEqual(['r1'])
    expect(evidence.ride.drift.map((p) => p.activityId)).toEqual(['b1'])
    expect(evidence.run.drift[0]!.decouplingPct).toBeCloseTo(3, 10)
  })

  it('leaves out the drift of an activity whose heart rate is set aside', () => {
    const evidence = lateEvidence(
      [digestOf('r1', 'run', DRIFT), digestOf('r2', 'run', DRIFT)],
      new Set(['r2']),
    )
    expect(evidence.run.drift.map((p) => p.activityId)).toEqual(['r1'])
  })

  it('keeps an activity with its heart rate set aside in the durability rows', () => {
    const digest = digestOf('r1', 'run', DRIFT)
    const curve = digest.curve.map((p) => (p.durationS === 300 ? { ...p, value: 5 } : p))
    const evidence = lateEvidence([{ ...digest, curve }], new Set(['r1']))
    expect(evidence.run.durability[0]!.fresh?.activityId).toBe('r1')
  })

  it('has a row for each duration and no drift for nothing', () => {
    const evidence = lateEvidence([], new Set())
    expect(evidence.run.durability.map((row) => row.durationS)).toEqual([300, 1200])
    expect(evidence.run.drift).toEqual([])
    expect(NO_LATE_EVIDENCE.ride.durability).toEqual([])
  })
})

describe('lateEvidence and the effort check', () => {
  const effortReference = (reading: 'trusted' | 'habitual'): EffortReference => ({
    referenceHr: { run: 190, ride: 184 },
    reading: { run: reading, ride: 'trusted' },
    source: { run: 'data', ride: 'data' },
    from: { run: 'run', ride: 'ride' },
  })
  const REFERENCE: LateReference = { effortReference: effortReference('trusted') }

  /** A long run with a late 20 minute best, whose peak heart rate was `peak`, and whose average was `average`. */
  function longRun(
    id: string,
    peak: number | null,
    average: number | null = null,
    drift: DigestDrift | null = DRIFT,
  ): ActivityDigest {
    return {
      ...digestOf(id, 'run', drift),
      maxHeartRate: peak,
      avgHeartRate: average,
      durability: [{ afterS: 3600, durationS: 1200, value: 12 }],
      // The synthetic stream's seconds by heart rate are not the peak this fixture sets.
      distributions: undefined,
    }
  }
  const supporters = (digests: ActivityDigest[], judged: LateReference | undefined = REFERENCE) =>
    lateEvidence(digests, new Set(), judged).run.durability.find((row) => row.durationS === 1200)!
      .after[0]!.best?.supporters ?? 0

  it('counts every session toward a late best, hard or easy', () => {
    const library = [
      longRun('hard1', 180),
      longRun('hard2', 175),
      longRun('easy1', 140),
      longRun('easy2', 120),
    ]
    expect(supporters(library)).toBe(4)
    expect(supporters(library, undefined)).toBe(4)
  })

  it('counts a library none of whose sessions reached a hard heart rate', () => {
    const library = [longRun('a', 120), longRun('b', 130), longRun('c', 125)]
    expect(supporters(library)).toBe(3)
    expect(lateEvidence(library, new Set(), REFERENCE).run.ruler).toBeNull()
  })

  it('counts a session with no heart rate, or with it set aside', () => {
    const library = [longRun('none', null), longRun('aside', 120), longRun('easy', 120)]
    const evidence = lateEvidence(library, new Set(['aside']), REFERENCE)
    expect(evidence.run.durability[1]!.after[0]!.best?.supporters).toBe(3)
  })

  it('counts the sessions where the reference cannot be trusted', () => {
    const library = [longRun('a', 188), longRun('b', 186)]
    expect(supporters(library, { effortReference: effortReference('habitual') })).toBe(2)
  })

  it('says how hard the sessions that were hard got, as their peak over the reference', () => {
    const evidence = lateEvidence(
      [longRun('a', 171), longRun('b', 190), longRun('c', 120)],
      new Set(),
      REFERENCE,
    )
    expect(evidence.run.ruler).toEqual({ sessions: 2, lowShare: 171 / 190, highShare: 1 })
    expect(lateEvidence([], new Set(), REFERENCE).run.ruler).toBeNull()
  })

  it('gives each steady effort its average heart rate over the reference', () => {
    const evidence = lateEvidence([longRun('a', 180, 133)], new Set(), REFERENCE)
    expect(evidence.run.drift[0]!.share).toBeCloseTo(133 / 190)
    expect(lateEvidence([longRun('a', 180, 133)], new Set()).run.drift[0]!.share).toBeNull()
  })
})

describe('lateEvidence for a period with too little', () => {
  /** A long session with a late 20 minute best and a fresh one to compare it with, whose peak heart rate was easy. */
  const long = (id: string, sport: Sport = 'run'): ActivityDigest => {
    const digest = digestOf(id, sport, DRIFT)
    return {
      ...digest,
      maxHeartRate: 120,
      curve: digest.curve.map((p) =>
        Object.assign({}, p, p.durationS === 1200 ? { value: 14 } : {}),
      ),
      durability: [{ afterS: 3600, durationS: 1200, value: 12 }],
    }
  }
  const ids = (n: number, sport: Sport = 'run') =>
    Array.from({ length: n }, (_, i) => long(`${sport}-${i}`, sport))
  const late = (period: ActivityDigest[], library: ActivityDigest[], sport: Sport = 'run') =>
    lateEvidence(period, new Set(), undefined, library)[sport]
  const supportersOf = (rows: ReturnType<typeof late>['durability']) =>
    rows.find((row) => row.durationS === 1200)!.after[0]!.best?.supporters ?? 0

  it('reads the whole library for late bests when the period has fewer than three long sessions', () => {
    const all = ids(7)
    const result = late(all.slice(0, 2), all)
    expect(supportersOf(result.durability)).toBe(7)
    expect(result.durabilityPooled).toBe(true)
  })

  it('reads the whole library for drift when the period has fewer than three steady efforts', () => {
    const all = ids(7)
    const result = late(all.slice(0, 2), all)
    expect(result.drift).toHaveLength(7)
    expect(result.driftPooled).toBe(true)
  })

  it('keeps the period’s own once it has three, and says nothing of the library', () => {
    const all = ids(7)
    const result = late(all.slice(0, 3), all)
    expect(supportersOf(result.durability)).toBe(3)
    expect(result.drift).toHaveLength(3)
    expect('durabilityPooled' in result).toBe(false)
    expect('driftPooled' in result).toBe(false)
  })

  it('pools each half apart: steady efforts can be enough where long sessions are not', () => {
    const all = [...ids(7), ...ids(1, 'ride')]
    const noLate = all
      .slice(0, 5)
      .map((digest, i) => (i < 2 ? digest : Object.assign({}, digest, { durability: [] })))
    const result = late(noLate, all)
    expect(result.durabilityPooled).toBe(true)
    expect('driftPooled' in result).toBe(false)
  })

  it('does not pool a sport the period holds all of', () => {
    const runs = ids(2)
    const rides = ids(6, 'ride')
    const result = late(runs, [...runs, ...rides])
    expect('durabilityPooled' in result).toBe(false)
    expect(late(runs, [...runs, ...rides], 'ride').durabilityPooled).toBe(true)
  })

  it('has no pooling for a period that is the library', () => {
    const all = ids(2)
    expect('durabilityPooled' in late(all, all)).toBe(false)
  })

  it('leaves out the drift of an activity whose heart rate is set aside, in the library too', () => {
    const all = ids(7)
    const result = lateEvidence(all.slice(0, 2), new Set(['run-6']), undefined, all).run
    expect(result.drift.map((p) => p.activityId)).not.toContain('run-6')
    expect(result.drift).toHaveLength(6)
  })
})
