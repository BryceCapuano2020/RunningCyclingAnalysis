import { describe, expect, it } from 'vitest'
import type { ActivityDigest, DigestDrift, Sport } from '../types'
import { digestActivity } from './digestActivity'
import { lateEvidence } from './lateEvidence'
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
