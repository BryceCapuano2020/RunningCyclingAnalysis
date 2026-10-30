import { describe, expect, it } from 'vitest'
import type { ActivityDigest, DigestDrift, Sport } from '../types'
import { digestActivity } from './digestActivity'
import { lateEvidence } from './lateEvidence'
import type { LateReference } from './lateEvidence'
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

describe('lateEvidence and the effort gate', () => {
  const REFERENCE: LateReference = {
    referenceHr: { run: 190, ride: 184 },
    referenceReading: { run: 'trusted', ride: 'trusted' },
  }

  /** A long run with a late 20 minute best, whose peak heart rate was `peak`, and whose average was `average`. */
  function longRun(id: string, peak: number | null, average: number | null = null): ActivityDigest {
    return {
      ...digestOf(id, 'run', DRIFT),
      maxHeartRate: peak,
      avgHeartRate: average,
      durability: [{ afterS: 3600, durationS: 1200, value: 12 }],
    }
  }
  const supporters = (digests: ActivityDigest[], judged = REFERENCE) =>
    lateEvidence(digests, new Set(), judged).run.durability.find((row) => row.durationS === 1200)!
      .after[0]!.best?.supporters ?? 0

  it('counts the sessions that reached a hard heart rate toward a late best, and not an easy long run', () => {
    const library = [
      longRun('hard1', 180),
      longRun('hard2', 175),
      longRun('easy1', 140),
      longRun('easy2', 120),
    ]
    expect(supporters(library)).toBe(2)
    // Without a reference to judge by, every session counts, as before.
    expect(lateEvidence(library, new Set()).run.durability[1]!.after[0]!.best?.supporters).toBe(4)
  })

  it('counts a session with no heart rate, or with it set aside: nothing says it was easy', () => {
    const library = [longRun('none', null), longRun('aside', 120), longRun('easy', 120)]
    const evidence = lateEvidence(library, new Set(['aside']), REFERENCE)
    expect(evidence.run.durability[1]!.after[0]!.best?.supporters).toBe(2)
  })

  it('counts none where the reference cannot be trusted', () => {
    const library = [longRun('a', 188), longRun('b', 186)]
    expect(
      supporters(library, { ...REFERENCE, referenceReading: { run: 'habitual', ride: 'trusted' } }),
    ).toBe(0)
  })

  it('says how hard the sessions behind the late bests were, as their peak over the reference', () => {
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
