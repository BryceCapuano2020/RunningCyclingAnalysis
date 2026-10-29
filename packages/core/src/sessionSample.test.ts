import { describe, expect, it } from 'vitest'
import { seasonDigests } from './sessionSample'
import { SAMPLE_CLOCK, SAMPLE_REFERENCE_NOW_MS, samplePlan } from './synthetic'

describe('seasonDigests', () => {
  it('has a digest for each planned activity, under its planned id', () => {
    const digests = seasonDigests(SAMPLE_CLOCK)
    expect(digests.map((digest) => digest.id)).toEqual(
      samplePlan(SAMPLE_CLOCK).map((entry) => entry.spec.id),
    )
  })

  it('draws a season on a UTC clock once and shares it, since a digest never changes', () => {
    expect(seasonDigests({ nowMs: SAMPLE_REFERENCE_NOW_MS + 3_600_000 })).toBe(
      seasonDigests(SAMPLE_CLOCK),
    )
  })

  it('draws a season on a clock with a zone of its own on every load, and keeps nothing for it', () => {
    const clock = { nowMs: SAMPLE_REFERENCE_NOW_MS, utcOffsetMinutes: () => -420 }
    const first = seasonDigests(clock)
    expect(seasonDigests(clock)).not.toBe(first)
    expect(first).not.toBe(seasonDigests(SAMPLE_CLOCK))
  })
})
