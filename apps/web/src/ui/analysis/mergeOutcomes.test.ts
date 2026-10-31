import { describe, expect, it } from 'vitest'
import { mergeOutcomes } from './mergeOutcomes'

describe('mergeOutcomes', () => {
  it('adds the counts and widens the span of start times', () => {
    const first = {
      activities: 3,
      filesAdded: 2,
      rejected: 1,
      duplicates: [],
      runs: 2,
      rides: 0,
      firstStartMs: 200,
      lastStartMs: 300,
    }
    const second = {
      activities: 1,
      filesAdded: 1,
      rejected: 0,
      duplicates: [{ fileName: 'a.fit', reason: 'Copy', code: 'empty' as const }],
      runs: 0,
      rides: 1,
      firstStartMs: 100,
      lastStartMs: 250,
      detailRestored: 1,
    }
    expect(mergeOutcomes(first, second)).toEqual({
      activities: 4,
      filesAdded: 3,
      rejected: 1,
      duplicates: second.duplicates,
      runs: 2,
      rides: 1,
      firstStartMs: 100,
      lastStartMs: 300,
      detailRestored: 1,
    })
  })

  it('leaves out what neither import counted', () => {
    const merged = mergeOutcomes(
      { activities: 0, rejected: 1, duplicates: [] },
      { activities: 0, rejected: 2, duplicates: [] },
    )
    expect(merged).toEqual({ activities: 0, rejected: 3, duplicates: [] })
  })

  it('adds the updated counts, and leaves them out when neither import updated any', () => {
    const base = { activities: 1, rejected: 0, duplicates: [] }
    expect(
      mergeOutcomes({ ...base, updatedRuns: 2, updatedRides: 0 }, { ...base, updatedRuns: 1 }),
    ).toMatchObject({ updatedRuns: 3, updatedRides: 0 })
    expect(mergeOutcomes(base, base)).not.toHaveProperty('updatedRuns')
  })
})
