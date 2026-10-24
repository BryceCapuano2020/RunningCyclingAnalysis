import { describe, expect, it } from 'vitest'
import type { SessionState } from '@rca/core/session'
import { makeResult } from '../components/fixtures'
import { baselineOf } from './importState'
import { EMPTY_SESSION } from './model'

function session(overrides: Partial<SessionState>): SessionState {
  return { ...EMPTY_SESSION, ...overrides }
}

describe('baselineOf', () => {
  it('compares an import against the result on screen', () => {
    const shown = makeResult()
    expect(baselineOf(session({ result: shown }))).toBe(shown)
  })

  it('compares an import against nothing when the sample was on screen', () => {
    expect(baselineOf(session({ result: makeResult(), isSample: true }))).toBeNull()
  })

  it('compares an import against nothing when no result was on screen', () => {
    expect(baselineOf(session({ result: null }))).toBeNull()
  })
})
