// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

afterEach(() => {
  cleanup()
})

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

describe('SegmentedControl', () => {
  it('names the group with a visible legend', () => {
    render(<SegmentedControl legend="Period" options={OPTIONS} selected="a" onSelect={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument()
    expect(screen.getByText('Period')).toHaveClass('segmented-control__legend')
  })

  it('keeps a hidden legend for assistive technology only', () => {
    render(
      <SegmentedControl
        legend="Units"
        legendHidden
        options={OPTIONS}
        selected="a"
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('group', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByText('Units')).toHaveClass('sr-only')
  })

  it('checks only the selected option and marks it with a check mark', () => {
    const { container } = render(
      <SegmentedControl legend="Period" options={OPTIONS} selected="b" onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Alpha' })).not.toBeChecked()
    const checks = container.querySelectorAll('.segmented-control__check')
    expect(checks).toHaveLength(2)
    checks.forEach((check) => expect(check).toHaveAttribute('aria-hidden', 'true'))
    expect(screen.getByRole('radio', { name: 'Beta' }).closest('label')).toHaveClass(
      'segmented-control__option--selected',
    )
  })

  it('reports the value of the option picked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<SegmentedControl legend="Period" options={OPTIONS} selected="a" onSelect={onSelect} />)
    await user.click(screen.getByRole('radio', { name: 'Beta' }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })
})
