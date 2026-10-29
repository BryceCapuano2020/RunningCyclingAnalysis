import { describe, expect, it } from 'vitest'
import { combine } from '../digest/combine'
import { NO_HEART_RATE_JUDGEMENT } from '../digest/setAsideTypes'
import { HeartRateJudge } from './heartRateJudge'
import { SET_ASIDE_SETTINGS as settings, setAsideLibrary } from './test/setAsideLibrary'

describe('HeartRateJudge', () => {
  const { digests } = setAsideLibrary()
  const library = combine(digests, settings)

  it("is the library's own judgement, with something actually set aside", () => {
    const judgement = new HeartRateJudge().of(digests, settings)
    expect(library.heartRateSetAside.length).toBeGreaterThan(0)
    expect(judgement.setAside).toEqual(library.heartRateSetAside)
  })

  it('says what it was judged against: the references of the activities kept, and the thresholds', () => {
    const judgement = new HeartRateJudge().of(digests, settings)
    // The all-time analysis keeps the same activities and judges them by the same references.
    expect(judgement.referenceHr).toEqual({
      run: library.runMaxHeartRate,
      ride: library.rideMaxHeartRate,
    })
    expect(judgement.threshold.run).toBeGreaterThan(0)
    expect(judgement.threshold.ride).toBeGreaterThan(0)
  })

  it('keeps the answer while the digests and the masses are the same', () => {
    const judge = new HeartRateJudge()
    const first = judge.of(digests, settings)
    expect(judge.of(digests, { ...settings })).toBe(first)
    expect(judge.of([...digests], settings)).toBe(first)
  })

  it('judges again after the library or the weight changes', () => {
    const judge = new HeartRateJudge()
    const first = judge.of(digests, settings)
    expect(judge.of(digests.slice(1), settings)).not.toBe(first)
    expect(judge.of(digests, { ...settings, massKg: settings.massKg + 5 })).not.toBe(first)
  })

  it('lets go of a judgement that holds a digest the library no longer has', () => {
    const judge = new HeartRateJudge()
    const first = judge.of(digests, settings)
    judge.release(digests.slice(1))
    expect(judge.of(digests, settings)).not.toBe(first)
    expect(judge.of(digests, settings)).toEqual(first)
  })

  it('has nothing to judge in a library without heart rate', () => {
    const bare = digests.map((digest) => Object.assign({}, digest, { hasHeartRate: false }))
    expect(new HeartRateJudge().of(bare, settings)).toBe(NO_HEART_RATE_JUDGEMENT)
  })

  it.each([
    ['massKg', 0],
    ['massKg', Number.NaN],
    ['bikeMassKg', 0],
    ['bikeMassKg', Number.NaN],
  ] as const)('refuses %s of %s, as the analysis does', (field, value) => {
    expect(() => new HeartRateJudge().of(digests, { ...settings, [field]: value })).toThrow(
      RangeError,
    )
  })
})
