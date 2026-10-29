// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'
import { steadyTrace } from './workbenchFixtures'

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
})
