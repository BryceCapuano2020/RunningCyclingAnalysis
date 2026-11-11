import { describe, expect, it } from 'vitest'
import { resultState, snapshotAt } from '../../test/stateCopyKit'
import { resultsFlags } from './resultsFlags'
import type { AccountResults } from './accountResults'
import { EMPTY_SESSION } from './model'

const results = (
  patch: Partial<AccountResults> & { empty?: boolean; version?: number },
): AccountResults => {
  const state = patch.empty === true ? EMPTY_SESSION : resultState()
  return {
    state,
    snapshot: { ...snapshotAt(1, 'UTC', state), libraryVersion: patch.version ?? 5 },
    stale: false,
    current: true,
    ...(patch.current === undefined ? {} : { current: patch.current }),
  }
}
const base = { failed: false, listedVersion: null as number | null }

describe('what the page says of the server’s results', () => {
  it('waits for an account with none yet (a 202, or nothing fetched), and is silent signed out', () => {
    expect(resultsFlags('u1', { ...base, results: null }, 'loaded', 200)).toEqual({
      resultsWaiting: true,
      resultsFailed: false,
    })
    expect(resultsFlags(null, { ...base, results: null }, 'idle', 0)).toEqual({
      resultsWaiting: false,
      resultsFailed: false,
    })
  })

  it('says the results could not be fetched when the read failed, except while the library read itself failed', () => {
    expect(resultsFlags('u1', { ...base, results: null, failed: true }, 'loaded', 200)).toEqual({
      resultsWaiting: false,
      resultsFailed: true,
    })
    expect(
      resultsFlags('u1', { ...base, results: null, failed: true }, 'failed', 200).resultsFailed,
    ).toBe(false)
  })

  it('waits when the results shown are older than the library: an empty snapshot while the index lists activities', () => {
    // A new account's empty snapshot, then a 200-file import: the server serves the stored one while it computes.
    const empty = results({ empty: true, current: false })
    expect(resultsFlags('u1', { ...base, results: empty }, 'loaded', 200)).toEqual({
      resultsWaiting: true,
      resultsFailed: false,
    })
    // The same after a reload, from the copy kept in rca-state (not yet confirmed current).
    expect(
      resultsFlags(
        'u1',
        { ...base, results: results({ empty: true, current: false }) },
        'loaded',
        200,
      ).resultsWaiting,
    ).toBe(true)
  })

  it('keeps a page that has results to show when the snapshot is behind the version the index was listed at, so a page in use is not replaced', () => {
    const behind = results({ current: false, version: 5 })
    expect(
      resultsFlags('u1', { ...base, results: behind, listedVersion: 7 }, 'loaded', 200)
        .resultsWaiting,
    ).toBe(false)
  })

  it('waits when an empty snapshot is behind the version the index was listed at, whatever the index counts', () => {
    const behind = results({ empty: true, current: false, version: 5 })
    expect(
      resultsFlags('u1', { ...base, results: behind, listedVersion: 7 }, 'loaded', 0)
        .resultsWaiting,
    ).toBe(true)
    // Current results of that version, or of a later one, are not waited on.
    expect(
      resultsFlags(
        'u1',
        { ...base, results: results({ empty: true, version: 7 }), listedVersion: 7 },
        'loaded',
        200,
      ).resultsWaiting,
    ).toBe(false)
    expect(
      resultsFlags('u1', { ...base, results: behind, listedVersion: 5 }, 'loaded', 0)
        .resultsWaiting,
    ).toBe(false)
  })

  it('does not wait for current results that are empty because the library is', () => {
    expect(resultsFlags('u1', { ...base, results: results({ empty: true }) }, 'loaded', 0)).toEqual(
      {
        resultsWaiting: false,
        resultsFailed: false,
      },
    )
    // Nor for current results with nothing to show while the index lists activities (all held out): that is the held page.
    expect(
      resultsFlags('u1', { ...base, results: results({ empty: true }) }, 'loaded', 200)
        .resultsWaiting,
    ).toBe(false)
  })
})
