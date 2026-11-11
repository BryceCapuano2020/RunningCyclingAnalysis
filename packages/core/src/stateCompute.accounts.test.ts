import { afterEach, describe, expect, it, vi } from 'vitest'
import { UTC_ZONE, setViewerZone } from './calendar'
import type { StateSnapshot } from './stateSnapshot'
import { accountsFor, inputFor, solo } from './test/accountKit'
import { snapshotCorpus } from './test/snapshotCorpus'
import { fixedZone } from './test/zones'

/*
 * Server compute is a pure function of its inputs: many accounts share one isolate, so a snapshot made for one account,
 * in its zone and with its settings, must not depend on which account was computed before it, on the same digest objects
 * or on others. Each account's figures are checked against the same account computed alone, in a fresh copy of every module.
 */

const library = snapshotCorpus()[0]!
const ACCOUNTS = accountsFor([])

afterEach(() => void setViewerZone(UTC_ZONE))

describe('a snapshot is a function of its inputs alone', () => {
  it('is the same whichever accounts were computed before it, on shared digests', async () => {
    const alone = new Map<string, StateSnapshot>()
    for (const account of ACCOUNTS) alone.set(account.name, await solo(library, account))
    // Distinct zones and settings must give distinct figures, or the comparison below proves nothing.
    expect(JSON.stringify(alone.get('far east'))).not.toBe(JSON.stringify(alone.get('far west')))

    vi.resetModules()
    const { computeSnapshot } = await import('./stateCompute')
    for (const i of [0, 1, 2, 0, 1, 2, 2, 1, 0]) {
      const account = ACCOUNTS[i]!
      expect(computeSnapshot(inputFor(library, account)), account.name).toStrictEqual(
        alone.get(account.name),
      )
    }
  })

  it('ignores the zone the module holds, and leaves it as it found it', async () => {
    const east = ACCOUNTS[0]!
    const alone = await solo(library, east)
    vi.resetModules()
    const { computeSnapshot } = await import('./stateCompute')
    const calendar = await import('./calendar')
    for (const held of [fixedZone(-11), fixedZone(5)]) {
      calendar.setViewerZone(held)
      const key = calendar.calendarKey()
      expect(computeSnapshot(inputFor(library, east))).toStrictEqual(alone)
      expect(calendar.calendarKey()).toBe(key)
    }
  })
})
