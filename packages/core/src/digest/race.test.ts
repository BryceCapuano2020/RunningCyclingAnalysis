import { describe, expect, it } from 'vitest'
import { sampleDataset } from '../synthetic'
import { digestActivity } from './digestActivity'
import { parseDigest, serializeDigest } from './serialize'
import { summaryOf } from './summary'

/** A race tag from the export reaches the digest, its stored form and the library list, and nothing else moves. */

const activity = sampleDataset().activities.find((a) => a.sport === 'run')!

describe('a race tag', () => {
  it('is on the digest, its stored form and its summary when the activity has it', () => {
    const digest = digestActivity({ ...activity, race: true })
    expect(digest.race).toBe(true)
    expect(parseDigest(serializeDigest(digest)).race).toBe(true)
    expect(summaryOf(digest).race).toBe(true)
  })

  it('leaves every other figure of the digest as it was, and is absent without the tag', () => {
    const plain = digestActivity(activity)
    const tagged = digestActivity({ ...activity, race: true })
    expect(plain).not.toHaveProperty('race')
    expect(parseDigest(serializeDigest(plain))).not.toHaveProperty('race')
    expect(summaryOf(plain)).not.toHaveProperty('race')
    const { race, ...rest } = tagged
    expect(race).toBe(true)
    expect(rest).toEqual(plain)
  })

  it('is ignored in a stored digest unless it is true', () => {
    const stored = JSON.parse(serializeDigest(digestActivity(activity))) as Record<string, unknown>
    expect(parseDigest(JSON.stringify({ ...stored, race: false }))).not.toHaveProperty('race')
  })
})
