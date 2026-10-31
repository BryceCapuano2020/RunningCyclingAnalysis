// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChangeItem } from './balanceChangeItems'
import { BalanceChanges } from './BalanceChanges'

afterEach(cleanup)

const LEAN: ChangeItem = {
  key: 'lean',
  direction: 'down',
  title: 'Lean eased 3 pts',
  body: 'From 9 pts toward running to 6 pts toward running. 90% range now 1 to 12 points.',
  tag: 'estimated',
}
const RIDE: ChangeItem = {
  key: 'ride-best',
  direction: 'up',
  title: 'New 20 min ride best',
  body: '246 W, 6 W more than previous 12 weeks.',
  tag: 'recorded',
}
const RUN: ChangeItem = {
  key: 'run-best',
  direction: 'up',
  title: 'New 20 min run best',
  body: '0:12 /mi faster than previous 12 weeks.',
  tag: 'recorded',
}
const GUESS: ChangeItem = { ...LEAN, key: 'guess', tag: 'estimated' }

describe('BalanceChanges', () => {
  it('is left out with no previous period, as under all time', () => {
    const { container } = render(<BalanceChanges changes={null} previousLabel={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is named by what it compares with', () => {
    render(
      <BalanceChanges
        changes={{ items: [LEAN], notes: [], unchecked: [], compared: true }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(
      screen.getByRole('region', { name: 'What changed · vs the previous 12 weeks' }),
    ).toBeInTheDocument()
  })

  it('lists each change with its title, its line and its tag, in order', () => {
    render(
      <BalanceChanges
        changes={{ items: [LEAN, RIDE, RUN], notes: [], unchecked: [], compared: true }}
        previousLabel="Previous 12 weeks"
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]!).getByText('Lean eased 3 pts')).toBeInTheDocument()
    expect(within(items[0]!).getByText('Estimated')).toBeInTheDocument()
    expect(within(items[1]!).getByText('Recorded')).toBeInTheDocument()
    expect(within(items[2]!).getByText('Recorded')).toBeInTheDocument()
  })

  it('words each tag as what the change rests on, and has no tag about ranges', () => {
    render(
      <BalanceChanges
        changes={{ items: [GUESS], notes: [], unchecked: [], compared: true }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(screen.getByText('Estimated')).toBeInTheDocument()
    expect(screen.queryByText('Beyond its range')).toBeNull()
    expect(screen.queryByText('Within its range')).toBeNull()
  })

  it('draws an arrow for each change, hidden from assistive technology, up or down by its direction', () => {
    const { container } = render(
      <BalanceChanges
        changes={{ items: [LEAN, RIDE], notes: [], unchecked: [], compared: true }}
        previousLabel="Previous 12 weeks"
      />,
    )
    const icons = container.querySelectorAll('.balance-changes__icon')
    expect(icons).toHaveLength(2)
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icons[0]?.querySelector('path')?.getAttribute('d')).toMatch(/^M12 6v12/)
    expect(icons[1]?.querySelector('path')?.getAttribute('d')).toMatch(/^M12 18V6/)
  })

  it('says in one line that nothing moved, naming the period, when there is nothing to list', () => {
    const { container } = render(
      <BalanceChanges
        changes={{ items: [], notes: [], unchecked: [], compared: true }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(screen.getByText('No clear change from the previous 12 weeks.')).toBeInTheDocument()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('marks a recorded best with a check, so the tag is more than a word', () => {
    const { container } = render(
      <BalanceChanges
        changes={{ items: [RIDE], notes: [], unchecked: [], compared: true }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(container.querySelector('.balance-changes__tag--recorded svg')).not.toBeNull()
  })

  it('says there is not enough to compare, not that nothing changed, when the previous period lacks the efforts', () => {
    const { container } = render(
      <BalanceChanges
        changes={{ items: [], notes: [], unchecked: [], compared: false }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(screen.getByText('Not enough in the previous 12 weeks to compare.')).toBeInTheDocument()
    expect(screen.queryByText(/No clear change/)).toBeNull()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('keeps the no-clear-change line and adds the unchecked one under it', () => {
    render(
      <BalanceChanges
        changes={{
          items: [],
          notes: [],
          unchecked: [
            'Effort not checked: too few running efforts shown hard by heart rate in both periods, so every effort counts.',
          ],
          compared: true,
        }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(screen.getByText(/No clear change/)).toBeInTheDocument()
    expect(screen.getByText(/Effort not checked: too few running efforts/)).toBeInTheDocument()
  })

  it('says in a line, in place of an item, that a best was not compared', () => {
    const { container } = render(
      <BalanceChanges
        changes={{
          items: [RIDE],
          notes: ['No comparable hard 20 min of running in the previous 12 weeks.'],
          unchecked: [],
          compared: true,
        }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(
      screen.getByText('No comparable hard 20 min of running in the previous 12 weeks.'),
    ).toBeInTheDocument()
  })

  it('never says a change is not a real change', () => {
    const { container } = render(
      <BalanceChanges
        changes={{ items: [LEAN, RIDE, RUN, GUESS], notes: [], unchecked: [], compared: true }}
        previousLabel="Previous 12 weeks"
      />,
    )
    expect(container.textContent).not.toMatch(/real change/i)
  })
})
