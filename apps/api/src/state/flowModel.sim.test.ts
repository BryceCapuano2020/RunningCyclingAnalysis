import { describe, expect, it } from 'vitest'
import { verdictOf } from './flowModel.ts'

// Wider bounds than the unit cases in flowModel.test.ts, each some hundreds of thousands of states.
describe('the server results flow at wider bounds', () => {
  it.each([
    [
      'every fault at once',
      { writes: 1, reads: 1, crashes: 1, fails: 1, redeliveries: 1, drops: 1, bumps: 1, days: 1 },
    ],
    [
      'two consumers with a crash and a duplicate',
      { consumers: 2, writes: 2, reads: 2, crashes: 1, redeliveries: 1 },
    ],
    ['three writes, a deploy and a day roll', { writes: 3, reads: 2, bumps: 1, days: 1 }],
  ])('%s', (_, bounds) => {
    expect(verdictOf(bounds)).toBe('ok')
  })
})
