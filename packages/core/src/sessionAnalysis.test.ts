import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY_MS } from './constants'
import { combine as combineDigests, digestActivity } from './digest'
import * as combineModule from './digest/combine'
import { encodeFit } from './fit'
import { splitPeriods } from './period'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { AthleteSettings } from './types'

vi.mock('./digest/combine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest/combine')>()
  return { ...actual, combine: vi.fn(actual.combine) }
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const HEAVIER: AthleteSettings = { massKg: 82, bikeMassKg: 9 }
const sampleActivities = sampleDataset().activities
// Digesting the sample is the slow part of these tests, so it is done once.
const SAMPLE_DIGESTS = sampleActivities.map(digestActivity)
const combine = vi.mocked(combineModule.combine)

/** A session on the sample's digests, with the analysis counted from here. */
function loadedSession() {
  const session = new AnalysisSession()
  session.loadDigests([...SAMPLE_DIGESTS], SETTINGS)
  combine.mockClear()
  return session
}

describe('AnalysisSession analysis cache', () => {
  beforeEach(() => {
    combine.mockClear()
  })

  it('reuses the analysis while the library, the period and both masses are the same', () => {
    const session = new AnalysisSession()
    const first = session.loadDigests([...SAMPLE_DIGESTS], SETTINGS)
    expect(combine).toHaveBeenCalledTimes(1)
    expect(session.setSettings(SETTINGS).result).toBe(first.result)
    expect(session.setGradeTrend(true, SETTINGS).result).toBe(first.result)
    expect(session.setGradeTrend(false, SETTINGS).result).toBe(first.result)
    expect(combine).toHaveBeenCalledTimes(1)
  })

  it('keeps the analysis of the last four periods for switching back and forth', () => {
    const session = loadedSession()
    const days = [7, 14, 21, 28]
    const first = days.map((choice) => session.setRange(choice, SETTINGS).result)
    expect(combine).toHaveBeenCalledTimes(4)
    days.forEach((choice, i) => expect(session.setRange(choice, SETTINGS).result).toBe(first[i]))
    expect(combine).toHaveBeenCalledTimes(4)
    // A fifth period pushes out the one used longest ago, which is now the 7 days.
    session.setRange(42, SETTINGS)
    expect(combine).toHaveBeenCalledTimes(5)
    expect(session.setRange(14, SETTINGS).result).toBe(first[1])
    expect(combine).toHaveBeenCalledTimes(5)
    expect(session.setRange(7, SETTINGS).result).toEqual(first[0])
    expect(combine).toHaveBeenCalledTimes(6)
  })

  it('keeps a revisited analysis over the one used longest ago', () => {
    const session = loadedSession()
    const first = [7, 14, 21, 28].map((choice) => session.setRange(choice, SETTINGS).result)
    expect(combine).toHaveBeenCalledTimes(4)
    // Revisiting the 7 days alone makes them the newest, so the fifth period pushes out the 14 days.
    expect(session.setRange(7, SETTINGS).result).toBe(first[0])
    expect(combine).toHaveBeenCalledTimes(4)
    session.setRange(42, SETTINGS)
    expect(combine).toHaveBeenCalledTimes(5)
    expect(session.setRange(7, SETTINGS).result).toBe(first[0])
    expect(combine).toHaveBeenCalledTimes(5)
    session.setRange(14, SETTINGS)
    expect(combine).toHaveBeenCalledTimes(6)
  })

  it('shares one analysis between periods that select the same activities', () => {
    const session = new AnalysisSession()
    const whole = session.loadDigests([...SAMPLE_DIGESTS], SETTINGS).result
    expect(session.setRange('all', SETTINGS).result).toBe(whole)
    expect(session.setRange(365, SETTINGS).result).toBe(whole)
    expect(combine).toHaveBeenCalledTimes(1)
  })

  it('analyses again when either mass changes, and matches an analysis made from scratch', () => {
    const session = loadedSession()
    const original = session.setSettings(SETTINGS).result
    expect(combine).not.toHaveBeenCalled()
    const heavier = session.setSettings(HEAVIER).result
    expect(combine).toHaveBeenCalledTimes(1)
    const longBike = session.setSettings({ ...HEAVIER, bikeMassKg: 12 }).result
    expect(combine).toHaveBeenCalledTimes(2)
    expect(heavier).not.toEqual(original)
    expect(longBike).not.toEqual(heavier)
    expect(session.setSettings(SETTINGS).result).toBe(original)
    expect(combine).toHaveBeenCalledTimes(2)
    const fresh = new AnalysisSession().loadDigests([...SAMPLE_DIGESTS], HEAVIER).result
    expect(heavier).toEqual(fresh)
  })

  it('analyses again after a saved activity is removed, and the removed one is gone', () => {
    const session = loadedSession()
    const before = session.setRange('all', SETTINGS).result!
    const gone = SAMPLE_DIGESTS[0]!
    const after = session.removeActivity(gone.sport, gone.startMs, SETTINGS).result!
    expect(combine).toHaveBeenCalledTimes(1)
    expect(before.activities.map((a) => a.id)).toContain(gone.id)
    expect(after.activities.map((a) => a.id)).not.toContain(gone.id)
  })

  it('analyses again when the library is replaced by a different one', () => {
    const session = loadedSession()
    const before = session.setRange('all', SETTINGS).result!
    const kept = SAMPLE_DIGESTS.slice(0, 5)
    const after = session.loadDigests(kept, SETTINGS).result!
    expect(combine).toHaveBeenCalledTimes(1)
    expect(after.activities).toHaveLength(kept.length)
    expect(before.activities.length).toBeGreaterThan(kept.length)
  })

  it('analyses again after the library is cleared, even when the same activities are loaded back', () => {
    const session = new AnalysisSession()
    session.loadDigests([...SAMPLE_DIGESTS], SETTINGS)
    expect(combine).toHaveBeenCalledTimes(1)
    session.clear()
    session.loadDigests([...SAMPLE_DIGESTS], SETTINGS)
    expect(combine).toHaveBeenCalledTimes(2)
  })

  it('analyses again once a different library has replaced the one first loaded', () => {
    const session = new AnalysisSession()
    session.loadDigests([...SAMPLE_DIGESTS], SETTINGS)
    session.loadDigests(SAMPLE_DIGESTS.slice(0, 5), SETTINGS)
    expect(combine).toHaveBeenCalledTimes(2)
    session.loadDigests([...SAMPLE_DIGESTS], SETTINGS)
    expect(combine).toHaveBeenCalledTimes(3)
  })

  it('analyses once, on the chosen period, when the library loads after the choice', () => {
    const session = loadedSession()
    session.choosePeriod(21)
    expect(combine).not.toHaveBeenCalled()
    const state = session.loadDigests([...SAMPLE_DIGESTS], SETTINGS)
    expect(combine).toHaveBeenCalledTimes(1)
    expect(state.period.days).toBe(21)
  })

  it('analyses again when a file adds an activity to the period', async () => {
    const session = loadedSession()
    const before = session.setRange('all', SETTINGS).result!
    const run = sampleActivities.find((activity) => activity.sport === 'run')!
    const newer = { ...run, startMs: run.startMs + 90 * DAY_MS }
    const file = new File([new Uint8Array(encodeFit(newer, { gps: true }))], 'newer.fit')
    const after = (await session.addFiles([file], SETTINGS)).result!
    expect(combine).toHaveBeenCalledTimes(1)
    expect(after.activities).toHaveLength(before.activities.length + 1)
  })

  it('keeps the analysis of a period that an older activity falls outside of', () => {
    const session = loadedSession()
    const recent = session.setRange(21, SETTINGS).result
    const newest = Math.max(...SAMPLE_DIGESTS.map((digest) => digest.startMs))
    // With no heart-rate blocks, so the library's heart-rate calibration, which every period reads, is as it was.
    const old = {
      ...SAMPLE_DIGESTS[0]!,
      id: 'old',
      startMs: newest - 400 * DAY_MS,
      hrBlocks: [],
    }
    const state = session.loadDigests([old, ...SAMPLE_DIGESTS], SETTINGS)
    expect(state.totalActivities).toBe(SAMPLE_DIGESTS.length + 1)
    expect(state.result).toBe(recent)
    expect(combine).toHaveBeenCalledTimes(1)
  })

  it('redoes the analysis of a period when an older activity moves the library’s heart-rate calibration', () => {
    const session = loadedSession()
    const recent = session.setRange(21, SETTINGS)
    const newest = Math.max(...SAMPLE_DIGESTS.map((digest) => digest.startMs))
    // An old ride whose heart rate runs high for its power, which moves the calibration.
    const ride = SAMPLE_DIGESTS.find(
      (digest) => digest.sport === 'ride' && digest.hrBlocks.length > 0,
    )!
    const old = {
      ...ride,
      id: 'old',
      startMs: newest - 400 * DAY_MS,
      hrBlocks: ride.hrBlocks.map((block) =>
        Object.assign({}, block, { heartRate: block.heartRate + 25 }),
      ),
    }
    combine.mockClear()
    const state = session.loadDigests([old, ...SAMPLE_DIGESTS], SETTINGS)
    expect(state.heartRateJudgement.calibration).not.toEqual(recent.heartRateJudgement.calibration)
    expect(state.result).not.toBe(recent.result)
    expect(combine).toHaveBeenCalledTimes(1)
  })

  it('ignores the visitor’s masses while the sample is on screen, as the analysis does', () => {
    const session = new AnalysisSession()
    const sample = session.loadSample(SETTINGS).result
    combine.mockClear()
    expect(session.setSettings(HEAVIER).result).toBe(sample)
    expect(combine).not.toHaveBeenCalled()
  })

  it('gives the same analysis as combining the period’s digests directly', () => {
    const session = loadedSession()
    session.setRange(21, SETTINGS)
    session.setRange('all', SETTINGS)
    const state = session.setRange(21, SETTINGS)
    const { selected } = splitPeriods(SAMPLE_DIGESTS, 21)
    // The period is read with the library's calibration and reference heart rates, which it has no say in.
    const { calibration, referenceHr, observedMaxHr } = state.heartRateJudgement
    expect(state.result).toEqual(
      combineDigests(selected, SETTINGS, {
        calibration,
        references: { referenceHr, observedMaxHr },
      }),
    )
  })
})
