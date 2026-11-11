// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { liftResultsOf } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { liftOfSnapshot, toSnapshot } from '@rca/core/stateSnapshot'
import { resultState } from '../../test/stateCopyKit'
import type { AccountController } from '../useAccount'
import { LiftConnected } from './LiftConnected'
import { liftOverviewOf } from './liftEntries'
import { liftTileOf } from './liftTile'
import { useLiftResults } from './useLiftResults'

/** L3: the Lift page and the hero's lift corner render from one snapshot, and a set not yet sent changes neither. */

const hook = vi.hoisted(() => ({ current: {} as Record<string, unknown>, sets: [] as unknown[] }))
vi.mock('./useLiftLog', () => ({ useLiftLog: () => hook.current }))
vi.mock('./useLiveLiftSets', () => ({ useLiveLiftSets: () => hook.sets }))

afterEach(cleanup)

const TODAY = '2031-03-02'
const SETTINGS = { massKg: 80, bikeMassKg: 9, birthYear: 1990, sex: 'male' as const }
const set = (exercise: string, loadKg: number, over: Partial<LiftSet> = {}): LiftSet => ({
  date: '2031-02-24',
  exercise,
  equipment: 'barbell',
  setOrder: 1,
  reps: 5,
  loadKg,
  rpe: 8,
  ...over,
})

const SAVED = [set('back-squat', 100), set('bench-press', 70), set('deadlift', 120)]
// A heavier squat this device logged and has not sent.
const UNSENT = set('back-squat', 200, { date: TODAY, setOrder: 2 })

/** The account's lift results as the page gets them: out of the server's snapshot, not computed here. */
const FROM_SNAPSHOT = liftOfSnapshot(
  toSnapshot(
    resultState(),
    { libraryVersion: 1, nowMs: 1, zone: 'UTC', buildSha: 'x' },
    { lift: liftResultsOf(SAVED, SETTINGS, TODAY), checkIn: null },
  ),
)!
const IF_SENT = liftResultsOf([...SAVED, UNSENT], SETTINGS, TODAY)

const account = {
  status: 'signed-in',
  me: { user: { id: 'u1' } },
  refresh: async () => null,
  markExpired: () => undefined,
} as unknown as AccountController

function logWith(sets: LiftSet[]) {
  hook.sets = sets
  hook.current = {
    days: [],
    sets,
    save: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    pendingCount: 1,
    recentLifts: [],
    ready: true,
    refused: 0,
    full: false,
  }
}

describe('one source of lift figures for an account', () => {
  it('gives the corner and the row the snapshot’s results, whatever this device has logged and not sent', () => {
    logWith([...SAVED, UNSENT])
    const { result } = renderHook(() =>
      useLiftResults({ status: 'signed-in', userId: 'u1', accountLift: FROM_SNAPSHOT }, SETTINGS),
    )
    expect(result.current).toBe(FROM_SNAPSHOT)
    expect(result.current).not.toEqual(IF_SENT)
    // The row and the corner read the one object: the row's total is the same big three the corner sums.
    const tile = liftTileOf(result.current, 'metric')
    const page = liftOverviewOf(result.current!, 'metric')
    expect(tile.figure).toEqual(page.bigThree?.total)
    expect(result.current?.corner.kind).toBe('graded')
  })

  it('draws the Lift page from the same snapshot, and a set not yet sent changes nothing on it', () => {
    logWith([...SAVED, UNSENT])
    const { container } = render(
      <LiftConnected
        account={account}
        units="metric"
        day={TODAY}
        today={TODAY}
        openDay={() => undefined}
        settings={SETTINGS}
        accountLift={FROM_SNAPSHOT}
      />,
    )
    const shown = container.textContent ?? ''
    const total = liftOverviewOf(FROM_SNAPSHOT, 'metric').bigThree!.total!
    expect(shown).toContain(`${total.number} ${total.unit}`)
    const ifSent = liftOverviewOf(IF_SENT, 'metric').bigThree!.total!
    expect(ifSent.number).not.toBe(total.number)
    expect(shown).not.toContain(`${ifSent.number} ${ifSent.unit}`)
    cleanup()
    // The same page with the unsent set gone from the log is the same page.
    logWith(SAVED)
    const again = render(
      <LiftConnected
        account={account}
        units="metric"
        day={TODAY}
        today={TODAY}
        openDay={() => undefined}
        settings={SETTINGS}
        accountLift={FROM_SNAPSHOT}
      />,
    )
    expect(again.container.textContent).toBe(shown)
    expect(screen.queryByText(`${ifSent.number} ${ifSent.unit}`)).toBeNull()
  })

  it('shows no figure before the snapshot has answered, rather than the log’s', () => {
    logWith(SAVED)
    const { container } = render(
      <LiftConnected
        account={account}
        units="metric"
        day={TODAY}
        today={TODAY}
        openDay={() => undefined}
        settings={SETTINGS}
        accountLift={null}
      />,
    )
    const total = liftOverviewOf(FROM_SNAPSHOT, 'metric').bigThree!.total!
    expect(container.textContent).not.toContain(`${total.number} ${total.unit}`)
  })

  it('signed out works the same figures out of the log with the same function', () => {
    logWith(SAVED)
    const { result } = renderHook(() =>
      useLiftResults({ status: 'signed-out', userId: null }, SETTINGS),
    )
    expect(result.current).toStrictEqual(liftResultsOf(SAVED, SETTINGS, result.current!.today))
  })
})
