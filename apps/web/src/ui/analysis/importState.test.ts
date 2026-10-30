import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import type { SessionState } from '@rca/core/session'
import { makeResult } from '../components/fixtures'
import { baselineOf, comparableBefore } from './importState'
import { EMPTY_SESSION } from './model'

function session(overrides: Partial<SessionState>): SessionState {
  return { ...EMPTY_SESSION, ...overrides }
}

const window12: Period = {
  choice: 'default',
  startMs: 1,
  endMs: 2,
  days: 84,
  fellBack: false,
}
const allTime: Period = { ...window12, days: null, fellBack: true }

describe('baselineOf', () => {
  it('compares an import against the result on screen, and the period it was made under', () => {
    const shown = makeResult()
    expect(baselineOf(session({ result: shown, period: window12 }))).toEqual({
      result: shown,
      period: window12,
    })
  })

  it('compares an import against nothing when the sample was on screen', () => {
    expect(baselineOf(session({ result: makeResult(), isSample: true }))).toBeNull()
  })

  it('compares an import against nothing when no result was on screen', () => {
    expect(baselineOf(session({ result: null }))).toBeNull()
  })
})

describe('comparableBefore', () => {
  const baseline = { result: makeResult(), period: window12 }

  it('is the baseline’s result when the import left the period in the same regime', () => {
    expect(comparableBefore(baseline, session({ period: { ...window12, endMs: 3 } }))).toBe(
      baseline.result,
    )
  })

  it('is nothing when the default period fell back to all time, or the other way', () => {
    expect(comparableBefore(baseline, session({ period: allTime }))).toBeNull()
    expect(
      comparableBefore({ result: baseline.result, period: allTime }, session({ period: window12 })),
    ).toBeNull()
  })

  it('is nothing without a baseline', () => {
    expect(comparableBefore(null, session({ period: window12 }))).toBeNull()
    expect(comparableBefore(undefined, session({ period: window12 }))).toBeNull()
  })
})
