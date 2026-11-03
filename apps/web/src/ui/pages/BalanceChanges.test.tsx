// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChangeItem } from './balanceChangeItems'
import { BalanceChanges } from './BalanceChanges'

afterEach(cleanup)

const LEAN: ChangeItem = {
  key: 'lean',
  direction: 'down',
  title: 'Lean eased 3 pts',
  body: 'Down from 9 pts toward running.',
}
const RIDE: ChangeItem = {
  key: 'ride-best',
  direction: 'up',
  title: 'New 20 min ride best',
  body: '246 W, 6 W more than previous 12 weeks.',
}
const RUN: ChangeItem = {
  key: 'run-best',
  direction: 'up',
  title: 'New 20 min run best',
  body: '0:12 /mi faster than previous 12 weeks.',
}

describe('BalanceChanges', () => {
  it('is left out with no previous period, as under all time', () => {
    const { container } = render(<BalanceChanges changes={null} previousLabel={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is named by what it compares with', () => {
    render(<BalanceChanges changes={{ items: [LEAN] }} previousLabel="Previous 12 weeks" />)
    expect(
      screen.getByRole('region', { name: 'What changed · vs the previous 12 weeks' }),
    ).toBeInTheDocument()
  })

  it('lists each change as its title and its line, in order, with no chip beside them', () => {
    const { container } = render(
      <BalanceChanges changes={{ items: [LEAN, RIDE, RUN] }} previousLabel="Previous 12 weeks" />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    // Everything an item says is its title and its line: no "Recorded", "Estimated" or "Not all-out" with them.
    expect(items.map((item) => item.textContent)).toEqual([
      'Lean eased 3 ptsDown from 9 pts toward running.',
      'New 20 min ride best246 W, 6 W more than previous 12 weeks.',
      'New 20 min run best0:12 /mi faster than previous 12 weeks.',
    ])
    expect(container.querySelector('.tag, .balance-changes__tag')).toBeNull()
  })

  it('draws an arrow for each change, hidden from assistive technology, up or down by its direction', () => {
    const { container } = render(
      <BalanceChanges changes={{ items: [LEAN, RIDE] }} previousLabel="Previous 12 weeks" />,
    )
    const icons = container.querySelectorAll('.balance-changes__icon')
    expect(icons).toHaveLength(2)
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icons[0]?.querySelector('path')?.getAttribute('d')).toMatch(/^M12 6v12/)
    expect(icons[1]?.querySelector('path')?.getAttribute('d')).toMatch(/^M12 18V6/)
  })

  it('says in one line that nothing moved, naming the period, when there is nothing to list', () => {
    const { container } = render(
      <BalanceChanges changes={{ items: [] }} previousLabel="Previous 12 weeks" />,
    )
    expect(
      screen.getByText('No clear change at 20 min from the previous 12 weeks.'),
    ).toBeInTheDocument()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('names a window further back by its months, in the title and the no-change line', () => {
    const { container } = render(
      <BalanceChanges changes={{ items: [] }} previousLabel="Jan to Mar" />,
    )
    expect(screen.getByRole('region', { name: 'What changed · vs Jan to Mar' })).toBeInTheDocument()
    expect(screen.getByText('No clear change at 20 min from Jan to Mar.')).toBeInTheDocument()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('has no line about efforts that were not hard or not checked', () => {
    const { container } = render(
      <BalanceChanges changes={{ items: [RIDE] }} previousLabel="Previous 12 weeks" />,
    )
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container.textContent).not.toMatch(/hard effort|comparable|not checked|every effort/i)
  })

  it('never says a change is not a real change', () => {
    const { container } = render(
      <BalanceChanges changes={{ items: [LEAN, RIDE, RUN] }} previousLabel="Previous 12 weeks" />,
    )
    expect(container.textContent).not.toMatch(/real change/i)
  })
})
