// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ImportOutcome } from '../worker/protocol'
import type { Route } from './route'
import { useBalanceAfterImport } from './useBalanceAfterImport'

const OUTCOME: ImportOutcome = { activities: 2, rejected: 0, duplicates: [] }
const LATER_OUTCOME: ImportOutcome = { activities: 1, rejected: 0, duplicates: [] }

interface Props {
  outcome: ImportOutcome | null
  page: Route['page']
  /** How many imports have been submitted so far. A new submission is taken as the import's origin. */
  submitted: number
}

function renderFor(initial: Props) {
  return renderHook(
    ({ outcome, page, submitted }: Props) => useBalanceAfterImport(outcome, page, submitted),
    { initialProps: initial },
  )
}

beforeEach(() => {
  window.location.hash = '#/profile'
})

afterEach(() => {
  window.location.hash = ''
})

describe('useBalanceAfterImport', () => {
  it('moves to Balance once an import submitted on Profile has its outcome', () => {
    const { rerender } = renderFor({ outcome: null, page: 'profile', submitted: 0 })
    rerender({ outcome: null, page: 'profile', submitted: 1 })
    rerender({ outcome: OUTCOME, page: 'profile', submitted: 1 })
    expect(window.location.hash).toBe('#/')
  })

  it('moves to Balance after an import submitted on Method', () => {
    window.location.hash = '#/method'
    const { rerender } = renderFor({ outcome: null, page: 'method', submitted: 0 })
    rerender({ outcome: null, page: 'method', submitted: 1 })
    rerender({ outcome: OUTCOME, page: 'method', submitted: 1 })
    expect(window.location.hash).toBe('#/')
  })

  it('moves for an import submitted on Profile while an earlier import from another page was still busy', () => {
    window.location.hash = '#/activities'
    const { rerender } = renderFor({ outcome: null, page: 'activities', submitted: 1 })
    window.location.hash = '#/profile'
    rerender({ outcome: null, page: 'profile', submitted: 2 })
    rerender({ outcome: OUTCOME, page: 'profile', submitted: 2 })
    expect(window.location.hash).toBe('#/')
  })

  it('does not move when the visitor went to another page before the outcome arrived', () => {
    const { rerender } = renderFor({ outcome: null, page: 'profile', submitted: 0 })
    rerender({ outcome: null, page: 'profile', submitted: 1 })
    window.location.hash = '#/method'
    rerender({ outcome: null, page: 'method', submitted: 1 })
    rerender({ outcome: OUTCOME, page: 'method', submitted: 1 })
    expect(window.location.hash).toBe('#/method')
  })

  it('does not move for an import submitted on a page that shows its results', () => {
    window.location.hash = '#/activities'
    const { rerender } = renderFor({ outcome: null, page: 'activities', submitted: 0 })
    rerender({ outcome: null, page: 'activities', submitted: 1 })
    rerender({ outcome: OUTCOME, page: 'activities', submitted: 1 })
    expect(window.location.hash).toBe('#/activities')
  })

  it('replaces the history entry rather than adding one', () => {
    const before = window.history.length
    const { rerender } = renderFor({ outcome: null, page: 'profile', submitted: 0 })
    rerender({ outcome: null, page: 'profile', submitted: 1 })
    rerender({ outcome: OUTCOME, page: 'profile', submitted: 1 })
    expect(window.location.hash).toBe('#/')
    expect(window.history.length).toBe(before)
  })

  it('moves once per import, not again on a later render with the same outcome', () => {
    const { rerender } = renderFor({ outcome: null, page: 'profile', submitted: 0 })
    rerender({ outcome: null, page: 'profile', submitted: 1 })
    rerender({ outcome: OUTCOME, page: 'profile', submitted: 1 })
    window.location.hash = '#/profile'
    rerender({ outcome: OUTCOME, page: 'profile', submitted: 1 })
    expect(window.location.hash).toBe('#/profile')

    rerender({ outcome: null, page: 'profile', submitted: 2 })
    rerender({ outcome: LATER_OUTCOME, page: 'profile', submitted: 2 })
    expect(window.location.hash).toBe('#/')
  })
  it('does not move for an outcome when no import was submitted, from the first render on Profile', () => {
    const { rerender } = renderFor({ outcome: null, page: 'profile', submitted: 0 })
    rerender({ outcome: OUTCOME, page: 'profile', submitted: 0 })
    expect(window.location.hash).toBe('#/profile')
  })
})
