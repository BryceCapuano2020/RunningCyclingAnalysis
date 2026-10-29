// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { makeActivity } from '../components/fixtures'
import { ActivitiesPage } from './ActivitiesPage'

beforeEach(() => {
  window.history.replaceState(null, '', '#/activities')
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

const at = (year: number, month: number, day: number) => new Date(year, month, day, 8).getTime()

// Two weeks in June 2025 (Mon 2 and Mon 9) and one in May, so the strip draws weeks.
const SET: ActivitySummary[] = [
  makeActivity({ id: 'a', name: 'Alpha run', sport: 'run', startMs: at(2025, 5, 11) }),
  makeActivity({ id: 'b', name: 'Bravo ride', sport: 'ride', startMs: at(2025, 5, 10) }),
  makeActivity({ id: 'c', name: 'Charlie run', sport: 'run', startMs: at(2025, 5, 3) }),
  makeActivity({ id: 'd', name: 'Delta run', sport: 'run', startMs: at(2025, 4, 28) }),
]

function page() {
  render(<ActivitiesPage signedIn={false} activities={SET} units="metric" records={new Map()} />)
}

const names = () =>
  screen
    .getAllByRole('link')
    .map((link) => link.textContent)
    .filter((name) => /^(Alpha|Bravo|Charlie|Delta)/.test(name ?? ''))

describe('the volume strip on the Activities page', () => {
  it('heads the list with what the period held', () => {
    page()
    expect(
      screen.getByRole('heading', { name: '3 runs and 1 ride, 4.0 h, across all time' }),
    ).toBeInTheDocument()
  })

  it('narrows the list to the week pressed, keeps it in the address, and clears it', async () => {
    const user = userEvent.setup()
    page()
    expect(names()).toEqual(['Alpha run', 'Bravo ride', 'Charlie run', 'Delta run'])
    await user.click(screen.getByRole('button', { name: /^Week of 9 Jun 2025/ }))
    expect(names()).toEqual(['Alpha run', 'Bravo ride'])
    expect(window.location.hash).toBe('#/activities?bucket=w%3A2025-5-9')
    expect(screen.getByText('Showing week of 9 Jun 2025')).toBeInTheDocument()
    // The strip keeps drawing the whole period, so another week can be picked.
    await user.click(screen.getByRole('button', { name: /^Week of 2 Jun 2025/ }))
    expect(names()).toEqual(['Charlie run'])
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(names()).toHaveLength(4)
    expect(window.location.hash).toBe('#/activities')
  })

  it('opens on the week the address names', () => {
    window.history.replaceState(null, '', '#/activities?bucket=w:2025-5-2')
    page()
    expect(names()).toEqual(['Charlie run'])
    expect(screen.getByRole('button', { name: /^Week of 2 Jun 2025/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps the week through a sort, and lets go of it when the sport or period changes', async () => {
    const user = userEvent.setup()
    page()
    await user.click(screen.getByRole('button', { name: /^Week of 9 Jun 2025/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'oldest')
    expect(names()).toEqual(['Bravo ride', 'Alpha run'])
    await user.click(screen.getByRole('radio', { name: 'Runs' }))
    expect(screen.queryByText(/^Showing week/)).not.toBeInTheDocument()
    expect(names()).toEqual(['Delta run', 'Charlie run', 'Alpha run'])
    expect(
      screen.getByRole('heading', { name: '3 runs, 3.0 h, across all time' }),
    ).toBeInTheDocument()
  })

  it('counts a period in its own words, and only the sport chosen', async () => {
    const user = userEvent.setup()
    page()
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(
      screen.getByRole('heading', { name: '3 runs and 1 ride, 4.0 h, in the last 6 weeks' }),
    ).toBeInTheDocument()
  })

  it('shows month totals for the listed activities, beside each month heading', () => {
    page()
    const june = screen.getByRole('heading', { name: 'Jun 2025' }).parentElement as HTMLElement
    expect(within(june).getByText('2 runs, 20.0 km')).toBeInTheDocument()
    expect(within(june).getByText('1 ride, 10.0 km')).toBeInTheDocument()
    expect(within(june).getByText('3.0 h')).toBeInTheDocument()
  })
})

describe('the Activities page with 2,000 activities', () => {
  // Six years, one a day or so, newest first: more than 70 months and 100 pages of rows.
  const many = Array.from({ length: 2000 }, (_, i) =>
    makeActivity({
      id: `m-${i}`,
      name: `Session ${i}`,
      sport: i % 3 === 0 ? 'ride' : 'run',
      startMs: at(2025, 5, 1) - i * 1_000 * 60 * 60 * 26,
    }),
  )

  it('draws a strip by month and one page of rows, so the DOM stays small', () => {
    render(<ActivitiesPage signedIn={false} activities={many} units="metric" records={new Map()} />)
    expect(screen.getByRole('group', { name: /Hours trained each month/ })).toBeInTheDocument()
    expect(document.querySelectorAll('.volume-strip__bar').length).toBeLessThanOrEqual(80)
    expect(document.querySelectorAll('.activity-list__item')).toHaveLength(20)
    expect(document.querySelectorAll('*').length).toBeLessThan(2500)
  })

  it('totals a month over every listed activity, not only the rows on the page', () => {
    render(<ActivitiesPage signedIn={false} activities={many} units="metric" records={new Map()} />)
    // The second month holds about 28 activities, and a page of 20 rows reaches into it from the first.
    const head = document.querySelectorAll('.activity-list__month-head')[1] as HTMLElement
    const counts = [
      ...head.querySelectorAll('.activity-list__total:not(.activity-list__total--hours)'),
    ]
    const shown = counts
      .map((el) => Number(/^(\d+)/.exec(el.textContent ?? '')?.[1] ?? 0))
      .reduce((sum, n) => sum + n, 0)
    expect(shown).toBeGreaterThan(22)
  })
})
