import { describe, expect, it } from 'vitest'
import { readNumber } from './trackpoints'

describe('readNumber on long text', () => {
  it('refuses a very long run of digits without trying every split of it', () => {
    const start = performance.now()
    readNumber('1'.repeat(50_000) + 'x')
    readNumber('1'.repeat(50_000))
    readNumber(' '.repeat(5_000) + '7')
    expect(performance.now() - start).toBeLessThan(500)
  })
})
