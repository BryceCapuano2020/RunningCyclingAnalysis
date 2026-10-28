// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'
import { RepFadeTable } from './ActivityWorkbenchReps'
import { repsTrace } from './workbenchFixtures'

afterEach(cleanup)

/** Four 5 min reps at a falling pace with a 1 min jog between them, and a heart rate climbing through. */
function intervals(options: { heartRate?: boolean; sport?: ActivityTrace['sport'] } = {}) {
  const { heartRate = true, sport = 'run' } = options
  const reps = [3.7, 3.65, 3.6, 3.5].flatMap((speed, i) => [
    { seconds: 300, speed, heartRate: heartRate ? 150 + 3 * i : undefined },
    { seconds: 60, speed: 2 },
  ])
  return repsTrace(
    sport,
    reps,
    [0, 1, 2, 3].map((i) => [i * 360, i * 360 + 300] as const),
  )
}

function renderTable(
  trace: ActivityTrace,
  selection = { startS: 0, endS: 1 },
  onSelect = vi.fn(),
  units: 'metric' | 'imperial' = 'metric',
) {
  render(<RepFadeTable trace={trace} units={units} selection={selection} onSelect={onSelect} />)
  return onSelect
}

describe('RepFadeTable', () => {
  it('leads with the fade, then lists each rep with its time, pace and heart rate', () => {
    renderTable(intervals())
    expect(screen.getByRole('heading', { name: 'How your reps held up' })).toBeInTheDocument()
    expect(screen.getByText('Rep 4 was 5% slower than rep 1.')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Rep', 'Time', 'Pace', 'Heart rate'])
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent))
    expect(rows[0]).toEqual(['Rep 1 Lap 1', '5:00', '4:30 /km', '150 bpm'])
    expect(rows[3]).toEqual(['Rep 4 Lap 4', '5:00', '4:46 /km', '159 bpm'])
  })

  it('writes pace per mile for an imperial reader', () => {
    renderTable(intervals(), undefined, undefined, 'imperial')
    expect(within(screen.getByRole('table')).getAllByText(/\/mi$/).length).toBe(4)
  })

  it('drops the heart rate column when no rep has one', () => {
    renderTable(intervals({ heartRate: false }))
    expect(screen.queryByRole('columnheader', { name: 'Heart rate' })).toBeNull()
  })

  it('reads a ride by its power', () => {
    const ride = repsTrace(
      'ride',
      [300, 296, 288].flatMap((power) => [
        { seconds: 240, power, heartRate: 150 },
        { seconds: 60, power: 100 },
      ]),
      [0, 1, 2].map((i) => [i * 300, i * 300 + 240] as const),
    )
    renderTable(ride)
    expect(screen.getByText('Rep 3 averaged 4% less power than rep 1.')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Measured power' })).toBeInTheDocument()
    expect(screen.getByText('300 W')).toBeInTheDocument()
  })

  it('selects a rep’s lap when it is chosen, and marks the chosen one pressed', async () => {
    const user = userEvent.setup()
    const onSelect = renderTable(intervals(), { startS: 360, endS: 660 })
    expect(screen.getByRole('button', { name: 'Rep 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rep 3' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Rep 3' }))
    expect(onSelect).toHaveBeenCalledWith({ startS: 720, endS: 1020 })
  })

  it('is left out for two reps, or for laps of different lengths', () => {
    const two = repsTrace(
      'run',
      [3.7, 3.6].flatMap((speed) => [
        { seconds: 300, speed },
        { seconds: 60, speed: 2 },
      ]),
      [
        [0, 300],
        [360, 660],
      ],
    )
    renderTable(two)
    expect(screen.queryByRole('heading', { name: 'How your reps held up' })).toBeNull()
  })

  it('never uses the words the owner rules out', () => {
    renderTable(intervals())
    const text = document.body.textContent ?? ''
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('the reps in the activity’s detail', () => {
  it('sit under the lap buttons, and choosing a rep presses its lap button', async () => {
    const user = userEvent.setup()
    const trace = intervals()
    render(
      <ActivityWorkbench
        activityId={trace.activityId}
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace })}
      />,
    )
    const heading = await screen.findByRole('heading', { name: 'How your reps held up' })
    const laps = screen.getByRole('heading', { name: 'Laps' })
    expect(laps.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Rep 2' }))
    expect(screen.getByRole('button', { name: /^Lap 2/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rep 2' })).toHaveAttribute('aria-pressed', 'true')
  })
})
