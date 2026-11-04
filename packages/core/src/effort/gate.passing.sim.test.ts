// The effort gate on synthetic libraries: hard training is let through (harness: test/gateSim.ts).
import { describe, expect, it } from 'vitest'
import { HARD_BOUNDS, allowLongArms, count, recordArms, train } from './test/gateSim'
import type { Arm } from './test/arms'

allowLongArms()

describe('hard training is let through', () => {
  const PASSING: Record<string, Arm> = {
    'hard (intervals weekly, a monthly test)': train('hard'),
    'hard but sparse (intervals every second week, one test)': train('hardSparse'),
    'hard, five weeks (12 to 29 days)': train('hard', {}, { weeks: 5 }),
    'hard with a day-to-day heart-rate offset': train('hard', {}, { dayOffsetBpm: 6 }),
    'hard riding': train('hard', {}, {}, 'ride'),
    'hard but sparse riding': train('hardSparse', {}, {}, 'ride'),
    'hard running and riding': {
      training: [
        { kind: 'hard', sport: 'run' },
        { kind: 'hard', sport: 'ride' },
      ],
    },
    'hard-heavy with the true maximum entered': train('hardHeavy', { entered: 1 }),
    'hard with the maximum entered 5% under the true one': train('hard', { entered: 0.95 }),
  }
  it.each(Object.entries(PASSING))('passes %s', (name, arm) => {
    // Recorded: 98 to 100 of 100.
    const { low } = count(name, arm, 'hard')
    expect(low, HARD_BOUNDS).toBeGreaterThan(0.9)
  })

  it('passes most hard-heavy athletes only when the age or the maximum is given', () => {
    // Intervals twice a week put the typical day at the maximum, which a tempo-only runner's also is. With the age known the
    // reference is checked against the age band and 77 of 100 pass; without it 99 of 100 are held as habitual, and entering the
    // maximum (previous test) passes 99.
    const noAge = count('hard-heavy', train('hardHeavy'), 'hard')
    const age = count('hard-heavy, age known', train('hardHeavy', { age: 'known' }), 'hard')
    expect(noAge.high).toBeLessThan(0.1)
    expect(age.low).toBeGreaterThan(0.65)
    expect(age.high).toBeLessThan(0.87)
  })
})

recordArms()
