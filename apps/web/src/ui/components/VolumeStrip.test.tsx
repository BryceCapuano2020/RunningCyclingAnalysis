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

function Harness({ activities = WEEKS, onSelect = vi.fn(), initial = null as string | null }) {
  const [selected, setSelected] = useState<string | null>(initial)
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
    // The parts share the stack by their seconds (the run 1 h, the ride 2 h), and the tallest week fills the strip.
    expect(parts[0]?.style.flexGrow).toBe('3600')
    expect(parts[1]?.style.flexGrow).toBe('7200')
    expect(first.querySelector<HTMLElement>('.volume-strip__stack')?.style.height).toBe('100%')
    const lighter = screen
      .getAllByRole('button')[1]!
      .querySelector<HTMLElement>('.volume-strip__stack')
    expect(lighter?.style.height).toBe(`${(1800 / 10800) * 100}%`)
  })

  it('narrows the list to the week pressed, says so in a chip, and lets go when pressed again', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const [week] = screen.getAllByRole('button', { name: /^Week of 2 Jun/ })
    await user.click(week!)
    expect(onSelect).toHaveBeenLastCalledWith('w:2025-5-2')
    expect(week).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Showing week of 2 Jun 2025: 2 activities')).toBeInTheDocument()
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
    expect(screen.getByText('Showing Sep 2024: 1 activity')).toBeInTheDocument()
  })

  it('shows the busiest column until one is pointed at, focused or picked', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('Busiest: week of 2 Jun 2025, 3.0 h')).toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('Week of 23 Jun 2025: 1 run, 0.5 h')).toBeInTheDocument()
  })

  /** Lays the group's columns out as 10 px boxes side by side from x = 0, as a browser would. */
  function lay(group: HTMLElement, widths: number[]) {
    let left = 0
    ;[...group.children].forEach((child, i) => {
      const box = { left, right: left + (widths[i] ?? 10) } as DOMRect
      left = box.right
      child.getBoundingClientRect = () => box
    })
  }

  it('follows the pointer across the strip, reading the column under it, so a thin column can be found', () => {
    render(<Harness />)
    const group = screen.getByRole('group', { name: /Hours trained each week/ })
    // Four weeks: two with training, two empty between them; each 10 px wide.
    lay(group, [10, 10, 10, 10])
    fireEvent.pointerMove(group, { clientX: 5 })
    expect(screen.getByText('Week of 2 Jun 2025: 1 run and 1 ride, 3.0 h')).toBeInTheDocument()
    fireEvent.pointerMove(group, { clientX: 35 })
    expect(screen.getByText('Week of 23 Jun 2025: 1 run, 0.5 h')).toBeInTheDocument()
    // Over a week with no training there is nothing to read, so the busiest column is back.
    fireEvent.pointerMove(group, { clientX: 15 })
    expect(screen.getByText('Busiest: week of 2 Jun 2025, 3.0 h')).toBeInTheDocument()
    fireEvent.pointerLeave(group)
    expect(screen.getByText('Busiest: week of 2 Jun 2025, 3.0 h')).toBeInTheDocument()
  })

  it('picks the nearest column with training when a tap lands beside a thin one', async () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const group = screen.getByRole('group', { name: /Hours trained each week/ })
    lay(group, [10, 10, 10, 10])
    // x = 14 is in the empty second week, nearer the first column's centre (5) than the last's (35).
    fireEvent.pointerUp(group, { clientX: 14 })
    expect(onSelect).toHaveBeenLastCalledWith('w:2025-5-2')
    fireEvent.pointerUp(group, { clientX: 20 })
    expect(onSelect).toHaveBeenLastCalledWith(null)
    fireEvent.pointerUp(group, { clientX: 31 })
    expect(onSelect).toHaveBeenLastCalledWith('w:2025-5-23')
  })

  it('picks nothing for a tap more than about 24 px from any column with training, or on a skipped stretch', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const group = screen.getByRole('group', { name: /Hours trained each week/ })
    lay(group, [10, 10, 10, 10])
    fireEvent.pointerUp(group, { clientX: 70 })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.pointerUp(group, { clientX: 20 })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('picks nothing for a tap on the skip mark, though a column is next to it', () => {
    const onSelect = vi.fn()
    render(
      <Harness
        onSelect={onSelect}
        activities={[
          makeActivity({ id: 'a', startMs: at(2019, 2, 4) }),
          makeActivity({ id: 'd', startMs: at(2025, 5, 2) }),
        ]}
      />,
    )
    const group = screen.getByRole('group', { name: /Hours trained each month/ })
    const kinds = [...group.children].map((child) => child.classList.contains('volume-strip__gap'))
    lay(
      group,
      kinds.map((isGap) => (isGap ? 28 : 10)),
    )
    const gapAt = [...group.children].findIndex((child) =>
      child.classList.contains('volume-strip__gap'),
    )
    const gapBox = group.children[gapAt]!.getBoundingClientRect()
    fireEvent.pointerUp(group, { clientX: (gapBox.left + gapBox.right) / 2 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not pick by position when a button took the click', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await user.click(screen.getAllByRole('button')[1]!)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith('w:2025-5-23')
  })

  it('folds a year or more with no training into one narrow column with a break mark', () => {
    render(
      <Harness
        activities={[
          makeActivity({ id: 'a', startMs: at(2019, 2, 4) }),
          makeActivity({ id: 'b', startMs: at(2020, 0, 10) }),
          makeActivity({ id: 'c', startMs: at(2024, 11, 2) }),
          makeActivity({ id: 'd', startMs: at(2025, 5, 2) }),
        ]}
      />,
    )
    const gap = screen.getAllByRole('img', { name: /^The strip skips / })
    expect(gap).toHaveLength(1)
    expect(gap[0]).toHaveAttribute('aria-label', expect.stringMatching(/1 Feb 2020 to 30 Nov 2024/))
    // Months from Mar 2019 to Jun 2025 are 76; the 58 quiet ones between Jan 2020 and Dec 2024 fold into one.
    const columns = screen.getByRole('group', { name: /Hours trained each month/ }).children
    expect(columns.length).toBeLessThan(25)
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('counts a picked bucket of another grain from the activities, a quarter on a month strip', () => {
    render(
      <Harness
        initial="q:2024-2"
        activities={[
          makeActivity({ id: 'old', startMs: at(2024, 8, 10) }),
          makeActivity({ id: 'old2', startMs: at(2024, 7, 10) }),
          makeActivity({ id: 'new', startMs: at(2025, 5, 10) }),
        ]}
      />,
    )
    expect(screen.getByText('Showing Jul to Sep 2024: 2 activities')).toBeInTheDocument()
  })

  it('draws a long stretch by the quarter on a phone, so a column is not a few pixels wide', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    window.matchMedia = ((query: string) => ({
      matches: query.includes('560'),
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      render(
        <Harness
          onSelect={onSelect}
          activities={[
            makeActivity({ id: 'old', startMs: at(2024, 8, 10) }),
            makeActivity({ id: 'new', startMs: at(2025, 5, 10) }),
          ]}
        />,
      )
      expect(screen.getByRole('group', { name: /Hours trained each quarter/ })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /^Jul to Sep 2024:/ }))
      expect(onSelect).toHaveBeenLastCalledWith('q:2024-2')
      expect(screen.getByText('Showing Jul to Sep 2024: 1 activity')).toBeInTheDocument()
    } finally {
      // @ts-expect-error jsdom has no matchMedia; the strip reads it as absent.
      delete window.matchMedia
    }
  })

  it('draws a stray 1970 date as one column and a skipped stretch, not 680 months of empty columns', () => {
    render(
      <Harness
        activities={[
          makeActivity({ id: 'epoch', startMs: 0 }),
          makeActivity({ id: 'now', startMs: at(2025, 5, 2) }),
        ]}
      />,
    )
    expect(screen.getAllByRole('img', { name: /^The strip skips / })).toHaveLength(1)
    expect(screen.getByRole('group', { name: /Hours trained each month/ }).children).toHaveLength(3)
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
