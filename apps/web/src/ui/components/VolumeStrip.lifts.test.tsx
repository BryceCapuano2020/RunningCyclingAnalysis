// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../test/deviceZone'
import type { ActivitySummary } from '@rca/core/pipeline'
import { dayOfCivil } from '@rca/core/calendar'
import { makeActivity } from './test/fixtures'
import { VolumeStrip } from './VolumeStrip'

afterEach(cleanup)

const at = (year: number, month: number, day: number) => new Date(year, month, day, 8).getTime()

/** Three weeks: a run and a ride, then a gap, then a run. */
const WEEKS: ActivitySummary[] = [
  makeActivity({ id: 'a', sport: 'run', startMs: at(2025, 5, 2), durationS: 3600 }),
  makeActivity({ id: 'b', sport: 'ride', startMs: at(2025, 5, 4), durationS: 7200 }),
  makeActivity({ id: 'c', sport: 'run', startMs: at(2025, 5, 23), durationS: 1800 }),
]

function Harness() {
  const [selected, setSelected] = useState<string | null>(null)
  return <VolumeStrip activities={WEEKS} selected={selected} onSelect={setSelected} />
}

describe('VolumeStrip with lifting', () => {
  it('adds a Lift legend entry and a lift part in its own ink, and says lifts in the description', () => {
    const lifts = [{ day: dayOfCivil(2025, 5, 3), seconds: 1800, measured: false }]
    const { container } = render(
      <VolumeStrip activities={WEEKS} lifts={lifts} selected={null} onSelect={() => undefined} />,
    )
    const key = [...container.querySelectorAll('.volume-strip__key li')].map((li) => [
      li.textContent,
      li.getAttribute('data-sport'),
    ])
    expect(key).toEqual([
      ['Run', 'run'],
      ['Ride', 'ride'],
      ['Lift, estimated', 'lift'],
    ])
    expect(
      container.querySelectorAll('[data-testid="volume-part"][data-sport="lift"]'),
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: /1 lift, ~[\d.]+ h/ })).toBeTruthy()
  })

  it('keys measured lifting as Lift, with no "~" on its hours', () => {
    const lifts = [{ day: dayOfCivil(2025, 5, 3), seconds: 1800, measured: true }]
    const { container } = render(
      <VolumeStrip activities={WEEKS} lifts={lifts} selected={null} onSelect={() => undefined} />,
    )
    expect(container.querySelector('.volume-strip__key [data-sport="lift"]')?.textContent).toBe(
      'Lift',
    )
    const week = screen.getByRole('button', { name: /1 lift, / })
    expect(week.getAttribute('aria-label')).not.toContain('~')
  })

  it('draws no Lift entry without lifting days', () => {
    const { container } = render(<Harness />)
    expect(container.querySelector('.volume-strip__key [data-sport="lift"]')).toBeNull()
  })

  it('counts the lifting days in the picked bucket chip, as the list shows them as rows', async () => {
    const lifts = [3, 4, 5].map((date) => ({
      day: dayOfCivil(2025, 5, date),
      seconds: 1800,
      measured: false,
    }))
    render(
      <VolumeStrip
        activities={WEEKS}
        lifts={lifts}
        selected="w:2025-5-2"
        onSelect={() => undefined}
      />,
    )
    expect(screen.getByText(/Showing week of 2 Jun 2025: 5 activities/)).toBeTruthy()
  })
})
