// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { localDayOfInstant } from '@rca/core/calendar'
import type { LiftRow } from '../activitiesLift'
import { makeActivity } from './test/fixtures'
import { ActivityList } from './ActivityList'

beforeAll(() => {
  vi.stubEnv('TZ', 'America/Los_Angeles')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

afterEach(cleanup)

const at = (month: number, date: number, hour: number) =>
  new Date(2026, month, date, hour).getTime()

function liftRow(startMs: number, extra: Partial<LiftRow> = {}): LiftRow {
  const day = localDayOfInstant(startMs)
  const date = new Date(startMs)
  const text = `2026-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return {
    day,
    date: text,
    startMs,
    seconds: 3000,
    measured: true,
    sets: 14,
    timed: true,
    name: `Lift ${text}`,
    ...extra,
  }
}

const RUN = makeActivity({ id: 'run', name: 'Morning run', startMs: at(3, 10, 7) })
const RIDE = makeActivity({ id: 'ride', name: 'Long ride', sport: 'ride', startMs: at(2, 20, 9) })

function renderList(lifts: LiftRow[]) {
  return render(
    <ActivityList
      signedIn={false}
      activities={[RUN, RIDE]}
      units="metric"
      records={new Map()}
      dateOrder
      keptIds={new Map([['run', 'saved-run']])}
      onDelete={() => undefined}
      lifts={lifts}
    />,
  )
}

const names = () =>
  screen.getAllByRole('listitem').map((row) => within(row).queryAllByRole('link')[0]?.textContent)

describe('ActivityList with lifting days', () => {
  it('lists each lifting day among the activities in date order, under its month', () => {
    renderList([liftRow(at(3, 10, 18)), liftRow(at(2, 1, 12))])
    expect(names()).toEqual(['Lift 2026-04-10', 'Morning run', 'Long ride', 'Lift 2026-03-01'])
    const months = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(months).toEqual(['Apr 2026', 'Mar 2026'])
  })

  it('opens the Lift page at the day, and gives time and sets with no "~" when measured', () => {
    renderList([liftRow(at(3, 10, 18))])
    const link = screen.getByRole('link', { name: 'Lift 2026-04-10' })
    expect(link.getAttribute('href')).toBe('#/lift?day=2026-04-10')
    const row = link.closest('li')!
    expect(row.getAttribute('data-sport')).toBe('lift')
    expect(row.textContent).toMatch(/Time50\smin/)
    expect(row.textContent).toMatch(/Sets14\ssets/)
    expect(row.textContent).toContain('6:00')
    expect(row.textContent).not.toMatch(/~|Estimated/)
  })

  it('marks an estimated day "~" and says so, and leaves out the time of day it does not have', () => {
    renderList([liftRow(at(3, 10, 0), { measured: false, timed: false })])
    const row = screen.getByRole('link', { name: 'Lift 2026-04-10' }).closest('li')!
    expect(row.textContent).toMatch(/Time~50\smin/)
    expect(within(row).getByText('Estimated time')).toBeTruthy()
    expect(within(row).queryByText(/, \d+:\d\d/)).toBeNull()
  })

  it('offers no Delete and no record on a lifting row', () => {
    renderList([liftRow(at(3, 10, 18))])
    const row = screen.getByRole('link', { name: 'Lift 2026-04-10' }).closest('li')!
    expect(within(row).queryByRole('button')).toBeNull()
    expect(row.textContent).not.toContain('Record')
  })

  it('pages over lifting days with the activities, and counts lifts when they are all that is listed', () => {
    const days = Array.from({ length: 19 }, (_, index) => liftRow(at(4, index + 1, 18)))
    renderList(days)
    expect(screen.getByText(/Showing 1–20 of 21 activities/)).toBeTruthy()
    cleanup()
    render(
      <ActivityList
        signedIn={false}
        activities={[]}
        units="metric"
        records={new Map()}
        dateOrder
        lifts={[...days, liftRow(at(3, 1, 18)), liftRow(at(3, 2, 18))]}
      />,
    )
    expect(screen.getByText(/Showing 1–20 of 21 lifts/)).toBeTruthy()
  })
})
