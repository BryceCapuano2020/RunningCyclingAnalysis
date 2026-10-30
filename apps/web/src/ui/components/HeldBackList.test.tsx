// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HeldOutActivity } from '@rca/core/session'
import { HeldBackList } from './HeldBackList'

function row(i: number, status: HeldOutActivity['status'] = 'stale'): HeldOutActivity {
  return { id: `a${i}`, name: `Run ${i}`, sport: 'run', startMs: Date.UTC(2024, 0, 1 + i), status }
}

describe('HeldBackList', () => {
  it('lists each held-out activity with why, by identity only', () => {
    render(<HeldBackList activities={[row(1), row(2, 'newer')]} />)
    const list = screen.getByRole('region', { name: 'Activities held out of the analysis' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Run 1')
    expect(items[0]).toHaveTextContent('Waiting for update')
    expect(items[1]).toHaveTextContent('Needs a newer app')
  })

  it('lists the first twenty and counts the rest', () => {
    render(<HeldBackList activities={Array.from({ length: 1_025 }, (_, i) => row(i))} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    expect(screen.getByText('And 1,005 more.')).toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<HeldBackList activities={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
