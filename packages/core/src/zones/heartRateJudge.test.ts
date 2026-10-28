import { describe, expect, it } from 'vitest'
import { combine } from '../digest/combine'
import { HeartRateJudge } from './heartRateJudge'
import { SET_ASIDE_SETTINGS as settings, setAsideLibrary } from './test/setAsideLibrary'

describe('HeartRateJudge', () => {
  const { digests } = setAsideLibrary()
  const expected = combine(digests, settings).heartRateSetAside

  it("is the library's own judgement, with something actually set aside", () => {
    expect(expected.length).toBeGreaterThan(0)
    expect(new HeartRateJudge().of(digests, settings)).toEqual(expected)
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
    expect(new HeartRateJudge().of(bare, settings)).toEqual([])
  })
})
