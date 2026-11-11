import { afterEach, describe, expect, it } from 'vitest'
import {
  forgetUnstored,
  forgetUnstoredFor,
  keepUnstored,
  unstoredFor,
  unstoredKey,
} from './lock.ts'

afterEach(forgetUnstored)

describe('the isolate cache of unstored results', () => {
  const result = { hash: 'h', json: '{}', nowMs: 1, version: 1 }

  it("forgets one account's results and keeps the others", () => {
    keepUnstored(unstoredKey('a', 1, 0, 5), result)
    keepUnstored(unstoredKey('ab', 1, 0, 5), result)
    forgetUnstoredFor('a')
    expect(unstoredFor(unstoredKey('a', 1, 0, 5))).toBeUndefined()
    expect(unstoredFor(unstoredKey('ab', 1, 0, 5))).toBeDefined()
  })

  it('holds a few results, the oldest going first', () => {
    for (let i = 0; i < 10; i += 1) keepUnstored(unstoredKey('a', i, 0, 5), result)
    expect(unstoredFor(unstoredKey('a', 0, 0, 5))).toBeUndefined()
    expect(unstoredFor(unstoredKey('a', 9, 0, 5))).toBeDefined()
  })
})
