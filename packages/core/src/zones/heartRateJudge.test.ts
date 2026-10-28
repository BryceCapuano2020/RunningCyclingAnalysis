import { describe, expect, it } from 'vitest'
import { combine } from '../digest/combine'
import { digestActivity } from '../digest/digestActivity'
import { sampleDataset } from '../synthetic'
import type { AthleteSettings } from '../types'
import { HeartRateJudge } from './heartRateJudge'

const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const digests = sampleDataset().activities.map((activity) => digestActivity(activity))

describe('HeartRateJudge', () => {
  const half = Math.floor(digests.length / 2)
  const selected = digests.slice(half)
  const period = combine(selected, settings)

  it("is the period's own judgement for all time, with no further work", () => {
    expect(new HeartRateJudge().of(digests, settings, digests, period)).toBe(
      period.heartRateSetAside,
    )
  })

  it('judges a period that is part of the library over the whole library, and keeps the answer', () => {
    const judge = new HeartRateJudge()
    const first = judge.of(digests, settings, selected, period)
    expect(first).toEqual(combine(digests, settings).heartRateSetAside)
    expect(judge.of(digests, { ...settings }, selected, period)).toBe(first)
  })

  it('judges again after the library changes, and lets go of one it no longer holds', () => {
    const judge = new HeartRateJudge()
    const first = judge.of(digests, settings, selected, period)
    expect(judge.of(digests.slice(1), settings, selected, period)).not.toBe(first)
    judge.release([])
    expect(judge.of(digests, settings, selected, period)).not.toBe(first)
  })

  it('has nothing to judge in a library with no heart rate distribution', () => {
    const bare = digests.map((digest) => Object.assign({}, digest, { distributions: undefined }))
    expect(new HeartRateJudge().of(bare, settings, bare.slice(1), period)).toEqual([])
  })
})
