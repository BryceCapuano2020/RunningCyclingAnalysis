import { describe, expect, it } from 'vitest'
import type { ActivityDigest } from '../types'
import {
  ENDURANCE_AVERAGE_SHARE,
  HARD_SESSION_SECONDS,
  reachedHard,
  sessionVerdict,
  sessionsOf,
} from './sessions'

/** A digest with the fields a session is judged by: its peak, its average and, optionally, its seconds by heart rate. */
function session(
  id: string,
  peak: number | null,
  average: number | null = null,
  seconds: Record<number, number> | null = null,
): ActivityDigest {
  const bpms =
    seconds === null
      ? []
      : Object.keys(seconds)
          .map(Number)
          .sort((a, b) => a - b)
  return {
    id,
    maxHeartRate: peak,
    avgHeartRate: average,
    ...(seconds === null
      ? {}
      : {
          distributions: {
            heartRate: {
              offset: bpms[0]!,
              counts: Array.from(
                { length: bpms.at(-1)! - bpms[0]! + 1 },
                (_, i) => seconds[bpms[0]! + i] ?? 0,
              ),
            },
          },
        }),
  } as unknown as ActivityDigest
}

describe('reachedHard', () => {
  it('needs the peak at the hard line', () => {
    expect(reachedHard(session('a', 171), 190)).toBe(true)
    expect(reachedHard(session('a', 160), 190)).toBe(false)
    expect(reachedHard(session('a', null), 190)).toBe(false)
  })

  it('needs a couple of minutes at the line where the digest has its seconds by heart rate, not a lone spike', () => {
    const spike = session('a', 175, null, { 140: 3000, 175: 30 })
    const held = session('b', 175, null, { 140: 3000, 175: HARD_SESSION_SECONDS })
    expect(reachedHard(spike, 190)).toBe(false)
    expect(reachedHard(held, 190)).toBe(true)
  })
})

describe('sessionsOf', () => {
  const library = [
    session('hard', 180, 150),
    session('easy', 140, 120),
    session('long', 150, 190 * ENDURANCE_AVERAGE_SHARE),
    session('aside', 185, 170),
  ]

  it('lists the hard sessions, and those whose average was high enough for a long effort', () => {
    const found = sessionsOf(library, 190, 'trusted', new Set(['aside']))
    // 'hard' averaged 150 of 190 (79%), under the endurance line; 'long' averaged exactly on it.
    expect(found).toEqual({ hard: ['hard'], endurance: ['long'] })
  })

  it('lists none against a reference that cannot be trusted, or none', () => {
    const empty = { hard: [], endurance: [] }
    expect(sessionsOf(library, 190, 'habitual', new Set())).toEqual(empty)
    expect(sessionsOf(library, null, null, new Set())).toEqual(empty)
  })
})

describe('sessionVerdict', () => {
  it('judges a session by its peak against the reference', () => {
    expect(sessionVerdict(session('a', 180), 190, 'trusted')).toBe('hard')
    expect(sessionVerdict(session('a', 150), 190, 'trusted')).toBe('notHard')
    expect(sessionVerdict(session('a', 190), 190, 'habitual')).toBe('notHard')
    expect(sessionVerdict(session('a', null), 190, 'trusted')).toBe('unknown')
    expect(sessionVerdict(session('a', 180), null, null)).toBe('unknown')
    expect(sessionVerdict(session('a', 180), 190, 'thin')).toBe('unknown')
  })
})
