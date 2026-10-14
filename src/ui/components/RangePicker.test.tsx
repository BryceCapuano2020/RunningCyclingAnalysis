// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RangePicker } from './RangePicker'

afterEach(() => {
  cleanup()
})

describe('RangePicker', () => {
  it('offers the four periods in a group named Period', () => {
    render(<RangePicker rangeDays={null} onChange={vi.fn()} shown={5} total={5} />)
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument()
    for (const label of ['6 weeks', '3 months', '1 year', 'All time']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
    }
  })

  it('checks All time when there is no limit, and the matching period otherwise', () => {
    const { unmount } = render(
      <RangePicker rangeDays={null} onChange={vi.fn()} shown={5} total={5} />,
    )
    expect(screen.getByRole('radio', { name: 'All time' })).toBeChecked()
    unmount()
    render(<RangePicker rangeDays={91} onChange={vi.fn()} shown={5} total={5} />)
    expect(screen.getByRole('radio', { name: '3 months' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All time' })).not.toBeChecked()
  })

  it('reports the number of days for a chosen period', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RangePicker rangeDays={null} onChange={onChange} shown={5} total={5} />)
    await user.click(screen.getByRole('radio', { name: '6 weeks' }))
    expect(onChange).toHaveBeenLastCalledWith(42)
    await user.click(screen.getByRole('radio', { name: '1 year' }))
    expect(onChange).toHaveBeenLastCalledWith(365)
  })

  it('reports null when All time is chosen', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RangePicker rangeDays={42} onChange={onChange} shown={2} total={5} />)
    await user.click(screen.getByRole('radio', { name: 'All time' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('shows how many activities are in the period when some are left out', () => {
    render(<RangePicker rangeDays={42} onChange={vi.fn()} shown={3} total={12} />)
    expect(screen.getByText('3 of 12 activities')).toBeInTheDocument()
  })

  it('shows no count when every activity is in the period', () => {
    render(<RangePicker rangeDays={42} onChange={vi.fn()} shown={4} total={4} />)
    expect(screen.queryByText(/activities/)).not.toBeInTheDocument()
  })

  it('uses the singular for a single activity in the total', () => {
    render(<RangePicker rangeDays={42} onChange={vi.fn()} shown={0} total={1} />)
    expect(screen.getByText('0 of 1 activity')).toBeInTheDocument()
  })
})
