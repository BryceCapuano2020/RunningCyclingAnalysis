// The effort gate on synthetic libraries: what must be held is held (harness: test/gateSim.ts).
import { describe, expect, it } from 'vitest'
import { HARD_BOUNDS, REAL_EASY, allowLongArms, count, recordArms, train } from './test/gateSim'
import type { Arm } from './test/arms'

allowLongArms()

describe('what must be held is held', () => {
  const HELD: Record<string, Arm> = {
    'easy only': train('easy'),
    'tempo only': train('tempo'),
    'easy only, age known': train('easy', { age: 'known' }),
    'realistic easy running (70% to 80% of maximum, strides)': train('easy', {}, REAL_EASY),
    'realistic easy running, age known': train('easy', { age: 'known' }, REAL_EASY),
    'five weeks of easy running (12 to 29 days)': train('easy', {}, { weeks: 5 }),
    'easy riding': train('easy', {}, {}, 'ride'),
    'easy running and easy riding': {
      training: [
        { kind: 'easy', sport: 'run' },
        { kind: 'easy', sport: 'ride' },
      ],
    },
    'easy running beside hard riding': {
      training: [
        { kind: 'easy', sport: 'run' },
        { kind: 'hard', sport: 'ride' },
      ],
    },
    'easy running with the true maximum entered': train('easy', { entered: 1 }),
  }
  it.each(Object.entries(HELD))('lets almost none of %s through as hard', (name, arm) => {
    // Recorded: 0 of 100 for every arm but realistic easy running (2 of 100, 4 with the age) and easy riding (5).
    const { high } = count(name, arm, 'hard')
    // The bound sits well over the recorded 5 (Wilson upper 0.11), so a draw that moves a few athletes does not fail it.
    expect(high, HARD_BOUNDS).toBeLessThan(0.17)
  })

  it('holds a tempo-only library with the age known 93 times in a hundred, and says so', () => {
    // Without the age it holds all; with it a reference of 150 bpm or more that is not within 10 bpm of the predicted
    // maximum is still read as habitual, and the rest (7 in 100) are trusted. That is the residual the entered maximum closes.
    const { low, high } = count('tempo only, age known', train('tempo', { age: 'known' }), 'hard')
    expect(high).toBeLessThan(0.17)
    expect(low).toBeLessThan(0.07)
  })
})

recordArms()
