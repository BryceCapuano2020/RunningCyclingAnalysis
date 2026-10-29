// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { makeActivity } from './fixtures'
import { VolumeStrip } from './VolumeStrip'
import { readStylesheet } from './stylesheet'

const css = await readStylesheet(import.meta.url, './VolumeStrip.css')

afterEach(cleanup)

const at = (year: number, month: number, day: number) => new Date(year, month, day, 8).getTime()

/** Three weeks: a run and a ride, then a gap, then a run. */
const WEEKS: ActivitySummary[] = [
  makeActivity({ id: 'a', sport: 'run', startMs: at(2025, 5, 2), durationS: 3600 }),
  makeActivity({ id: 'b', sport: 'ride', startMs: at(2025, 5, 4), durationS: 7200 }),
  makeActivity({ id: 'c', sport: 'run', startMs: at(2025, 5, 23), durationS: 1800 }),
]

function Harness({ activities = WEEKS, onSelect = vi.fn() }) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <VolumeStrip
      activities={activities}
      periodText="in the last 6 weeks"
      selected={selected}
      onSelect={(key) => {
        onSelect(key)
        setSelected(key)
      }}
    />
  )
}

describe('VolumeStrip', () => {
  it('says what the stretch held as its heading', () => {
    render(<Harness />)
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: '2 runs and 1 ride, 3.5 h, in the last 6 weeks',
      }),
    ).toBeInTheDocument()
  })

  it('makes a button of each week that has training, named by its week and totals, and none for an empty week', () => {
    render(<Harness />)
    const bars = screen.getAllByRole('button')
    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
      'Week of 2 Jun 2025: 1 run and 1 ride, 3.0 h',
      'Week of 23 Jun 2025: 1 run, 0.5 h',
    ])
    expect(document.querySelectorAll('.volume-strip__slot')).toHaveLength(2)
  })

  it('stacks each sport in its own colour, taller for more time', () => {
    render(<Harness />)
    const first = screen.getAllByRole('button')[0]!
    const parts = first.querySelectorAll<HTMLElement>('[data-testid="volume-part"]')
    expect([...parts].map((part) => part.dataset.sport)).toEqual(['run', 'ride'])
    // The tallest week is 3 h; the run is 1 of them and the ride 2.
    expect(parts[0]?.style.height).toMatch(/^33\.3/)
    expect(parts[1]?.style.height).toMatch(/^66\.6/)
  })

  it('narrows the list to the week pressed, says so in a chip, and lets go when pressed again', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const [week] = screen.getAllByRole('button', { name: /^Week of 2 Jun/ })
    await user.click(week!)
    expect(onSelect).toHaveBeenLastCalledWith('w:2025-5-2')
    expect(week).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Showing week of 2 Jun 2025')).toBeInTheDocument()
    await user.click(week!)
    expect(onSelect).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText(/^Showing week/)).not.toBeInTheDocument()
  })

  it('clears the week from the chip', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await user.click(screen.getAllByRole('button', { name: /^Week of 23 Jun/ })[0]!)
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('is one tab stop, moved between the columns by the arrow keys, Home and End', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const [first, last] = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'))
    expect(first).toHaveAttribute('tabindex', '-1')
    expect(last).toHaveAttribute('tabindex', '0')
    await user.tab()
    expect(last).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(first).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(last).toHaveFocus()
    await user.keyboard('{Home}')
    expect(first).toHaveFocus()
    await user.keyboard('{End}')
    expect(last).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(last).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws a stretch longer than 26 weeks by the month and says so', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Harness
        onSelect={onSelect}
        activities={[
          makeActivity({ id: 'old', startMs: at(2024, 8, 10) }),
          makeActivity({ id: 'new', startMs: at(2025, 5, 10) }),
        ]}
      />,
    )
    expect(screen.getByRole('group', { name: /Hours trained each month/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Sep 2024:/ }))
    expect(onSelect).toHaveBeenLastCalledWith('m:2024-8')
    expect(screen.getByText('Showing Sep 2024')).toBeInTheDocument()
  })

  it('shows the busiest column until one is pointed at, focused or picked', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('Busiest: week of 2 Jun 2025, 3.0 h')).toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('Week of 23 Jun 2025: 1 run, 0.5 h')).toBeInTheDocument()
  })

  it('follows the pointer across the strip, reading the column under it, so a thin column can be found', () => {
    render(<Harness />)
    const group = screen.getByRole('group', { name: /Hours trained each week/ })
    group.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect
    // Four weeks span the strip: the pointer at 10% is over the first, at 90% over the last.
    fireEvent.pointerMove(group, { clientX: 10 })
    expect(screen.getByText('Week of 2 Jun 2025: 1 run and 1 ride, 3.0 h')).toBeInTheDocument()
    fireEvent.pointerMove(group, { clientX: 90 })
    expect(screen.getByText('Week of 23 Jun 2025: 1 run, 0.5 h')).toBeInTheDocument()
    // Over a week with no training there is nothing to read, so the busiest column is back.
    fireEvent.pointerMove(group, { clientX: 40 })
    expect(screen.getByText('Busiest: week of 2 Jun 2025, 3.0 h')).toBeInTheDocument()
    fireEvent.pointerLeave(group)
    expect(screen.getByText('Busiest: week of 2 Jun 2025, 3.0 h')).toBeInTheDocument()
  })

  it('draws nothing for no activities', () => {
    render(<Harness activities={[]} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('keeps its colours to the sport tokens, and has forced-colours and phone rules', () => {
    expect(css).toContain('var(--sport-colour)')
    expect(css).toContain('@media (forced-colors: active)')
    expect(css).toContain('@media (max-width: 560px)')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
