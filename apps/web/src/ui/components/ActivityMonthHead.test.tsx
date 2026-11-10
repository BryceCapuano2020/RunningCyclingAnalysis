// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { dayOfCivil } from '@rca/core/calendar'
import { monthTotals } from '../activitiesVolume'
import { makeActivity } from './test/fixtures'
import { ActivityMonthHead } from './ActivityMonthHead'

afterEach(cleanup)

describe('ActivityMonthHead', () => {
  it('names each total: a sport’s count and distance together, then the hours as the total', () => {
    const start = new Date(2026, 9, 2, 7).getTime()
    const activities = [
      makeActivity({ id: 'r1', sport: 'run', startMs: start, durationS: 3600, distanceM: 10_000 }),
      makeActivity({
        id: 'r2',
        sport: 'run',
        startMs: start + 86_400_000,
        durationS: 3600,
        distanceM: 8_000,
      }),
      makeActivity({ id: 'b1', sport: 'ride', startMs: start, durationS: 7200, distanceM: 60_000 }),
    ]
    const totals = [...monthTotals(activities).values()][0]
    const { container } = render(
      <ActivityMonthHead label="Oct 2026" totals={totals} units="metric" />,
    )
    const parts = [...container.querySelectorAll('.activity-list__total')].map((part) =>
      (part.textContent ?? '').replace('; ', ''),
    )
    expect(parts).toEqual(['2 runs · 18.0 km', '1 ride · 60.0 km', '4.0 h total'])
  })

  it('names lifts with no distance before the total, and the hours include lifting', () => {
    const start = new Date(2026, 9, 2, 7).getTime()
    const run = makeActivity({
      id: 'r1',
      sport: 'run',
      startMs: start,
      durationS: 3600,
      distanceM: 10_000,
    })
    const lifts = [4, 6, 9, 13].map((date) => ({
      day: dayOfCivil(2026, 9, date),
      seconds: 1800,
      measured: date !== 13,
    }))
    const totals = [...monthTotals([run], lifts).values()][0]
    const { container } = render(
      <ActivityMonthHead label="Oct 2026" totals={totals} units="metric" />,
    )
    const parts = [...container.querySelectorAll('.activity-list__total')].map((part) =>
      (part.textContent ?? '').replace('; ', ''),
    )
    // One day's time is estimated from its sets: lifting's hours and a total that includes it carry "~".
    expect(parts).toEqual(['1 run · 10.0 km', '4 lifts · ~2.0 h', '~3.0 h total'])
    expect(container.querySelector('[data-sport="lift"]')).not.toBeNull()
  })

  it('writes no "~" for a month whose lifting was all measured', () => {
    const lifts = [4, 6].map((date) => ({
      day: dayOfCivil(2026, 9, date),
      seconds: 1800,
      measured: true,
    }))
    const totals = [...monthTotals([], lifts).values()][0]
    const { container } = render(
      <ActivityMonthHead label="Oct 2026" totals={totals} units="metric" />,
    )
    expect(container.querySelector('.activity-list__totals')?.textContent).toBe(
      '2 lifts · 1.0 h; 1.0 h total',
    )
  })
})
