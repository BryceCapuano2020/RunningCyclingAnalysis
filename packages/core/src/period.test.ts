import { describe, expect, it } from 'vitest'
import { DAY_MS } from './constants'
import { digestActivity } from './digest'
import { splitPeriods } from './period'
import { sampleDataset } from './synthetic'
import type { ActivityDigest } from './types'

const [sample] = sampleDataset().activities
const NEWEST = Date.UTC(2025, 5, 30, 12)

/** A digest of the sample activity, started at startMs. */
function at(startMs: number): ActivityDigest {
  if (sample === undefined) throw new Error('The sample has no activities')
  const digest = digestActivity({ ...sample, id: `${startMs}`, startMs })
  return { ...digest, id: `${startMs}-${digest.sport}` }
}

describe('splitPeriods', () => {
  const visible = [at(NEWEST), at(NEWEST - 10 * DAY_MS), at(NEWEST - 30 * DAY_MS)]

  it('selects the last rangeDays days up to the newest activity, and the period before it', () => {
    const { selected, previous, startMs } = splitPeriods(visible, 7)
    expect(startMs).toBe(NEWEST - 7 * DAY_MS)
    expect(selected.map((d) => d.startMs)).toEqual([NEWEST])
    expect(previous.map((d) => d.startMs)).toEqual([NEWEST - 10 * DAY_MS])
  })

  it('gives everything as selected, with no previous period, for all time', () => {
    expect(splitPeriods(visible, null)).toEqual({ selected: visible, previous: [], startMs: null })
  })

  it('gives nothing for an empty library', () => {
    expect(splitPeriods([], 7)).toEqual({ selected: [], previous: [], startMs: null })
  })
})
