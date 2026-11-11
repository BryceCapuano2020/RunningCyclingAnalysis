// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import type { LiftSet } from '@rca/core/lift'
import type { ActivitySummary } from '@rca/core/pipeline'
import { makeActivity } from '../components/test/fixtures'
import { ActivitiesPage } from './ActivitiesPage'

const live = vi.hoisted(() => ({ sets: [] as LiftSet[] }))
vi.mock('../lift/useLiveLiftSets', () => ({ useLiveLiftSets: () => live.sets }))

beforeEach(() => {
  window.history.replaceState(null, '', '#/activities')
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  live.sets = []
})

const at = (year: number, month: number, day: number) => new Date(year, month, day, 8).getTime()

const SET: ActivitySummary[] = [
  makeActivity({ id: 'a', name: 'Alpha run', sport: 'run', startMs: at(2025, 5, 11) }),
  makeActivity({ id: 'b', name: 'Bravo ride', sport: 'ride', startMs: at(2025, 5, 3) }),
]

function sets(date: string, exercise: string, count: number, times?: string[]): LiftSet[] {
  return Array.from({ length: count }, (_, index) => ({
    date,
    exercise,
    equipment: 'barbell',
    setOrder: index + 1,
    reps: 5,
    loadKg: 80,
    ...(times && { time: times[index]!, timePrecision: 'set' as const }),
  }))
}

function page(activities = SET) {
  render(
    <ActivitiesPage signedIn={false} activities={activities} units="metric" records={new Map()} />,
  )
}

const rowNames = () =>
  screen
    .getAllByRole('listitem')
    .map((row) => within(row).queryAllByRole('link')[0]?.textContent)
    .filter((name) => name !== undefined)

describe('lifting days on the Activities page', () => {
  it('lists a lifting day as a row among the runs and rides, and keeps it under Lifts', async () => {
    live.sets = [...sets('2025-06-07', 'bench-press', 4), ...sets('2025-06-07', 'back-squat', 2)]
    const user = userEvent.setup()
    page()
    expect(rowNames()).toEqual(['Alpha run', 'Bench press, back squat', 'Bravo ride'])
    expect(screen.getByRole('link', { name: 'Bench press, back squat' })).toHaveAttribute(
      'href',
      '#/lift?day=2025-06-07',
    )
    await user.click(screen.getByRole('radio', { name: 'Lifts' }))
    expect(rowNames()).toEqual(['Bench press, back squat'])
    expect(window.location.hash).toBe('#/activities?sport=lift')
    await user.click(screen.getByRole('radio', { name: 'Runs' }))
    expect(rowNames()).toEqual(['Alpha run'])
  })

  it('marks only the estimated days, and keys the strip Lift when every day was measured', () => {
    live.sets = sets('2025-06-07', 'bench-press', 3, ['18:00', '18:20', '18:40'])
    page()
    const row = screen.getByRole('link', { name: 'Bench press' }).closest('li')!
    expect(row.textContent).not.toMatch(/~|Estimated/)
    expect(document.querySelector('.volume-strip__key [data-sport="lift"]')?.textContent).toBe(
      'Lift',
    )
    cleanup()
    live.sets = [...live.sets, ...sets('2025-06-09', 'back-squat', 2)]
    page()
    const estimated = screen.getByRole('link', { name: 'Back squat' }).closest('li')!
    expect(within(estimated).getByText('Estimated time')).toBeInTheDocument()
    expect(document.querySelector('.volume-strip__key [data-sport="lift"]')?.textContent).toBe(
      'Lift, estimated',
    )
  })

  it('lists lifting days with no runs or rides on file', () => {
    live.sets = sets('2025-06-07', 'bench-press', 2)
    page([])
    expect(screen.queryByText('No activities yet')).toBeNull()
    expect(rowNames()).toEqual(['Bench press'])
  })
})
