import './test/warmSample'
import { describe, expect, it, vi } from 'vitest'
import { seasonDigests } from './sessionSample'
import { SAMPLE_CLOCK, SAMPLE_REFERENCE_NOW_MS, samplePlan } from './synthetic'
import type { ActivityDigest } from './types'

/** A stand-in for the drawing that makes no season: the decision to draw is what is under test. */
function fakeDraw() {
  return vi.fn((): ActivityDigest[] => [])
}

const DAY_MS = 86_400_000

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

  it('draws a season on a clock with a zone of its own once, and shares it as the app needs', () => {
    const draw = fakeDraw()
    // A week no other test uses. The offset is a function, as the app's is, and changes nothing here.
    const clock = { nowMs: Date.UTC(2031, 2, 11, 8), utcOffsetMinutes: () => -420 }
    const first = seasonDigests(clock, draw)
    expect(seasonDigests(clock, draw)).toBe(first)
    // Another day of the same week, in the same zone, is the same season.
    const later = { ...clock, nowMs: clock.nowMs + 2 * DAY_MS }
    expect(seasonDigests(later, draw)).toBe(first)
    expect(draw).toHaveBeenCalledTimes(1)
    expect(draw).toHaveBeenCalledWith(clock)
  })

  it('draws a season of its own for another zone, for a zone that changes its offset, and for a new week', () => {
    const draw = fakeDraw()
    const nowMs = Date.UTC(2031, 5, 8, 8)
    const seattle = seasonDigests({ nowMs, utcOffsetMinutes: () => -420 }, draw)
    const tokyo = seasonDigests({ nowMs, utcOffsetMinutes: () => 540 }, draw)
    // Daylight saving: the offset moves an hour a few weeks into the season, so its starts differ.
    const springForward = Date.UTC(2031, 4, 1)
    const shifting = seasonDigests(
      { nowMs, utcOffsetMinutes: (ms) => (ms < springForward ? -480 : -420) },
      draw,
    )
    const nextWeek = seasonDigests(
      { nowMs: nowMs + 7 * DAY_MS, utcOffsetMinutes: () => -420 },
      draw,
    )
    expect(draw).toHaveBeenCalledTimes(4)
    expect(new Set([seattle, tokyo, shifting, nextWeek]).size).toBe(4)
  })

  it('keeps only the few seasons used most lately: a hit keeps a season, the one unused longest goes', () => {
    const draw = fakeDraw()
    const week = (n: number) => ({
      nowMs: Date.UTC(2032, 0, 4, 8) + n * 7 * DAY_MS,
      utcOffsetMinutes: () => -300,
    })
    for (let n = 0; n < 4; n++) seasonDigests(week(n), draw)
    // Week 0 is used again, so week 1 is now the one used longest ago.
    seasonDigests(week(0), draw)
    seasonDigests(week(4), draw)
    expect(draw).toHaveBeenCalledTimes(5)
    seasonDigests(week(0), draw)
    expect(draw).toHaveBeenCalledTimes(5)
    seasonDigests(week(1), draw)
    expect(draw).toHaveBeenCalledTimes(6)
  })
})
