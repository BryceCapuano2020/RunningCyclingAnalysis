// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'
import { repsTrace, steadyTrace } from './workbenchFixtures'

/** A run of `count` laps, each `lap` seconds, the last one longer so the widths differ. */
function lapped(count: number, lap = 60): ActivityTrace {
  const trace = steadyTrace(count * lap + 60)
  trace.laps = Array.from({ length: count }, (_, i) => ({
    startS: i * lap,
    endS: i === count - 1 ? trace.durationS : (i + 1) * lap,
  }))
  return trace
}

function show(trace: ActivityTrace) {
  return render(
    <ActivityWorkbench
      activityId={trace.activityId}
      units="metric"
      loadTrace={async () => ({ kind: 'trace', trace })}
    />,
  )
}

describe('many laps', () => {
  it('keep eight or fewer as numbered buttons, with no bar and no line under them', async () => {
    show(lapped(8))
    await screen.findByRole('button', { name: /^Lap 1 / })
    expect(document.querySelector('.lap-strip--bar')).toBeNull()
    expect(document.querySelector('.lap-strip__line')).toBeNull()
  })

  it('become a proportional bar from nine, each lap as wide as it was long', async () => {
    show(lapped(12))
    const group = await screen.findByRole('group', { name: 'Laps' })
    const grows = within(group)
      .getAllByRole('button')
      .map((button) => Number.parseFloat((button as HTMLElement).style.flexGrow))
    expect(grows).toHaveLength(12)
    expect(grows.slice(0, 11).every((grow) => grow === 60)).toBe(true)
    expect(grows[11]).toBe(120)
  })

  it('leave the number out of a segment too narrow for it, and keep its name', async () => {
    show(lapped(60, 30))
    const group = await screen.findByRole('group', { name: 'Laps' })
    const first = within(group).getByRole('button', { name: /^Lap 1 / })
    // Sixty laps over 640 px is about 10 px each.
    expect(first).toHaveTextContent('')
    expect(first).toHaveAccessibleName('Lap 1 · from 0:00 · 30 s')
  })

  it('name the chosen lap and its figures under the bar', async () => {
    const user = userEvent.setup()
    show(lapped(12))
    const line = () => document.querySelector('.lap-strip__line')
    await screen.findByRole('group', { name: 'Laps' })
    expect(line()).toHaveTextContent('12 laps. Choose one to zoom to it.')
    await user.click(screen.getByRole('button', { name: /^Lap 3 / }))
    expect(line()).toHaveTextContent('Lap 3 · from 2:00 · 1 min · 5:33 /km · 140 bpm')
  })

  it('are one stop in the tab order, and the arrows and Home and End step between laps', async () => {
    const user = userEvent.setup()
    show(lapped(12))
    const group = await screen.findByRole('group', { name: 'Laps' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1)
    await user.click(buttons[2]!)
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{ArrowRight}')
    expect(buttons[3]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[3]).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{End}')
    expect(buttons[11]).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{ArrowRight}')
    expect(buttons[11]).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Home}')
    expect(buttons[0]).toHaveFocus()
    expect(buttons[0]!.tabIndex).toBe(0)
  })

  it('leave Up and Down to scroll the page, and tie the chosen lap to the line that measures it', async () => {
    const user = userEvent.setup()
    show(lapped(12))
    const group = await screen.findByRole('group', { name: 'Laps' })
    const buttons = within(group).getAllByRole('button')
    // The group is named by the heading, not by a label of its own that says the same.
    expect(group).not.toHaveAttribute('aria-label')
    expect(document.getElementById(group.getAttribute('aria-labelledby')!)).toHaveTextContent(
      'Laps',
    )
    expect(buttons.some((button) => button.hasAttribute('aria-describedby'))).toBe(false)
    await user.click(buttons[4]!)
    await user.keyboard('{ArrowDown}{ArrowUp}')
    expect(buttons[4]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[4]).toHaveFocus()
    const line = document.getElementById(buttons[4]!.getAttribute('aria-describedby')!)
    expect(line).toHaveTextContent(/^Lap 5 · from 4:00/)
    expect(buttons.filter((button) => button.hasAttribute('aria-describedby'))).toHaveLength(1)
  })
})

describe('laps and suggested intervals', () => {
  /** Four 5 min reps with a 1 min jog between them, and the device's laps cutting across them every 8 min. */
  function lappedReps(): ActivityTrace {
    const reps = [3.7, 3.65, 3.6, 3.5].flatMap((speed) => [
      { seconds: 300, speed, heartRate: 150 },
      { seconds: 60, speed: 2 },
    ])
    return repsTrace('run', reps, [
      [0, 480],
      [480, 960],
      [960, 1440],
    ])
  }

  it('shows both, the device’s laps first and the suggested intervals beside them', async () => {
    show(lappedReps())
    await screen.findByRole('heading', { name: 'Laps' })
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles.indexOf('Laps')).toBeGreaterThanOrEqual(0)
    expect(titles.indexOf('Suggested intervals')).toBeGreaterThan(titles.indexOf('Laps'))
    expect(screen.getByRole('button', { name: /^Lap 1 · from 0:00/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Interval 1 · from / })).toBeInTheDocument()
  })

  it('shows the suggestions alone when the device recorded none, and the laps alone when nothing is suggested', async () => {
    const trace = lappedReps()
    trace.laps = []
    const { unmount } = show(trace)
    await screen.findByRole('heading', { name: 'Suggested intervals' })
    expect(screen.queryByRole('heading', { name: 'Laps' })).toBeNull()
    unmount()
    show(lapped(4))
    await screen.findByRole('heading', { name: 'Laps' })
    expect(screen.queryByRole('heading', { name: 'Suggested intervals' })).toBeNull()
  })
})
