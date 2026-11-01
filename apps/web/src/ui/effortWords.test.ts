import { describe, expect, it } from 'vitest'
import { gate } from './effortGateFixtures'
import { notHardWords } from './effortWords'

describe('notHardWords, where the reference a share is of comes from', () => {
  it('names the sport’s own max heart rate when its own days set it', () => {
    const own = notHardWords(
      'ride',
      gate({ share: 0.82, referenceFrom: 'ride' }),
      'let them be compared',
    )
    expect(own.why).toBe(
      'it reached 82% of your cycling max heart rate, under the 90% that marks a hard effort',
    )
    expect(own.reference).toBe(false)
    const run = notHardWords('run', gate({ share: 0.8, referenceFrom: 'run' }), 'give a threshold')
    expect(run.why).toBe(
      'it reached 80% of your running max heart rate, under the 90% that marks a hard effort',
    )
  })

  it('says a ride’s borrowed max heart rate is the running max less 6 bpm', () => {
    const borrowed = notHardWords(
      'ride',
      gate({ share: 0.82, referenceFrom: 'run' }),
      'let them be compared',
    )
    expect(borrowed.why).toBe(
      'it reached 82% of your cycling max heart rate (your running max less 6 bpm), under the 90% that marks a hard effort',
    )
    expect(borrowed.action).toBe('A 20 min effort at 90% or more of it would let them be compared.')
    expect(borrowed.why).not.toMatch(/because|limiter|weak|strength/i)
  })

  it('says a run’s borrowed max heart rate is the cycling max', () => {
    const borrowed = notHardWords(
      'run',
      gate({ share: 0.84, referenceFrom: 'ride' }),
      'give a threshold',
    )
    expect(borrowed.why).toBe(
      'it reached 84% of your running max heart rate (your cycling max), under the 90% that marks a hard effort',
    )
  })

  it('treats a max heart rate with no supplier as the sport’s own', () => {
    const none = notHardWords(
      'ride',
      gate({ share: 0.7, referenceFrom: null }),
      'let them be compared',
    )
    expect(none.why).toContain('of your cycling max heart rate,')
  })
})
