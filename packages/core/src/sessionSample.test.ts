import { describe, expect, it, vi } from 'vitest'
import { seasonDigests } from './sessionSample'
import { SAMPLE_CLOCK, SAMPLE_REFERENCE_NOW_MS, samplePlan } from './synthetic'
import type { ActivityDigest } from './types'

/** A stand-in for the drawing that makes no season: the decision to draw is what is under test. */
function fakeDraw() {
  return vi.fn((): ActivityDigest[] => [])
}

describe('seasonDigests', () => {
  it('has a digest for each planned activity, under its planned id', () => {
    // The one real drawing in this file, on the clock every other test shares.
    const digests = seasonDigests(SAMPLE_CLOCK)
    expect(digests.map((digest) => digest.id)).toEqual(
      samplePlan(SAMPLE_CLOCK).map((entry) => entry.spec.id),
    )
  })

  it('draws a season on a UTC clock once and shares it, since a digest never changes', () => {
    const draw = fakeDraw()
    // A day no other test uses, so nothing is held for it yet.
    const clock = { nowMs: Date.UTC(2031, 2, 2, 8) }
    const first = seasonDigests(clock, draw)
    expect(seasonDigests({ nowMs: clock.nowMs + 3_600_000 }, draw)).toBe(first)
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('shares the season held for the fixed reference clock, drawing nothing again', () => {
    const draw = fakeDraw()
    seasonDigests(SAMPLE_CLOCK)
    expect(seasonDigests({ nowMs: SAMPLE_REFERENCE_NOW_MS + 3_600_000 }, draw)).toBe(
      seasonDigests(SAMPLE_CLOCK),
    )
    expect(draw).not.toHaveBeenCalled()
  })

  it('draws a season on a clock with a zone of its own on every load, and keeps nothing for it', () => {
    const draw = fakeDraw()
    const clock = { nowMs: Date.UTC(2031, 2, 9, 8), utcOffsetMinutes: () => -420 }
    const first = seasonDigests(clock, draw)
    const second = seasonDigests(clock, draw)
    expect(draw).toHaveBeenCalledTimes(2)
    expect(draw).toHaveBeenCalledWith(clock)
    expect(second).not.toBe(first)
    // Nothing was kept: a UTC clock on the same day still draws.
    const utc = fakeDraw()
    seasonDigests({ nowMs: clock.nowMs }, utc)
    expect(utc).toHaveBeenCalledTimes(1)
  })
})
