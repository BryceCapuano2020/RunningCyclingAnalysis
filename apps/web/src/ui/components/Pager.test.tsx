// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pager, type PagerProps } from './Pager'

afterEach(() => {
  cleanup()
})

/** A pager over 45 activities in pages of 20, on the page given (counted from zero). */
function pager(overrides: Partial<PagerProps> = {}) {
  return (
    <Pager
      page={0}
      pageCount={3}
      pageSize={20}
      total={45}
      noun="activities"
      label="Activity pages"
      onPageChange={vi.fn()}
      {...overrides}
    />
  )
}

describe('Pager', () => {
  it('summarises the items on the page and names the page', () => {
    render(pager())
    expect(screen.getByText('Showing 1–20 of 45 activities. Page 1 of 3.')).toBeInTheDocument()
  })

  it('counts the last page up to the total', () => {
    render(pager({ page: 2 }))
    expect(screen.getByText('Showing 41–45 of 45 activities. Page 3 of 3.')).toBeInTheDocument()
  })

  it('names the navigation and keeps the summary outside it', () => {
    render(pager())
    const navigation = screen.getByRole('navigation', { name: 'Activity pages' })
    expect(within(navigation).getByRole('button', { name: 'Next page' })).toBeInTheDocument()
    expect(within(navigation).queryByText(/^Showing /)).not.toBeInTheDocument()
    expect(screen.getByText(/^Showing /)).toBeInTheDocument()
  })

  it('groups the counts in the summary from a thousand on', () => {
    render(pager({ page: 50, pageCount: 53, total: 1045 }))
    expect(
      screen.getByText('Showing 1,001–1,020 of 1,045 activities. Page 51 of 53.'),
    ).toBeInTheDocument()
  })

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(pager())
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()

    rerender(pager({ page: 2 }))
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('asks for the page on either side of the current one', () => {
    const onPageChange = vi.fn()
    render(pager({ page: 1, onPageChange }))

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(0, expect.any(HTMLElement))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(2, expect.any(HTMLElement))
  })

  it('keeps both buttons focusable while busy, and ignores clicks on them', () => {
    const onPageChange = vi.fn()
    render(pager({ page: 1, busy: true, onPageChange }))

    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('keeps focus on the button pressed when the pager turns busy', async () => {
    const user = userEvent.setup()
    const { rerender } = render(pager({ page: 1 }))
    const next = screen.getByRole('button', { name: 'Next page' })
    await user.click(next)

    rerender(pager({ page: 1, busy: true }))
    expect(next).toHaveFocus()
  })

  it('shows no navigation and an empty summary on one page', () => {
    render(pager({ pageCount: 1, total: 5 }))
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Showing /)).not.toBeInTheDocument()
  })

  it('stays an empty status on one page when it announces, so a second page is heard', () => {
    const { rerender } = render(pager({ pageCount: 1, total: 5, announce: true }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    rerender(pager({ announce: true }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 1–20 of 45 activities. Page 1 of 3.',
    )
  })

  it('is a status only when it announces', () => {
    render(pager())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(/^Showing /)).not.toHaveAttribute('aria-live')
  })

  it('reports focus entering and leaving its controls', async () => {
    const user = userEvent.setup()
    const onFocusWithinChange = vi.fn()
    render(
      <>
        {pager({ onFocusWithinChange })}
        <button type="button">Elsewhere</button>
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onFocusWithinChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(onFocusWithinChange).toHaveBeenLastCalledWith(false)
  })
})

describe('Pager page numbers', () => {
  it('numbers each page, and marks the page shown as the current one', () => {
    render(pager())
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Page 2' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument()
  })

  it('asks for the numbered page that is pressed', () => {
    const onPageChange = vi.fn()
    render(pager({ page: 0, onPageChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    expect(onPageChange).toHaveBeenLastCalledWith(2, expect.any(HTMLElement))
  })

  it('shows the first and last pages and the pages either side of the current one, with a gap', () => {
    render(pager({ page: 14, pageCount: 30, total: 600 }))
    for (const name of ['Page 1', 'Page 14', 'Page 15', 'Page 16', 'Page 30']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Page 5' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Page 13' })).not.toBeInTheDocument()
  })

  it('says the pages a gap leaves out, for a screen reader', () => {
    render(pager({ page: 14, pageCount: 30, total: 600 }))
    expect(screen.getAllByText('pages skipped')).toHaveLength(2)
  })

  it('shows the one page a gap would hide, as its own number', () => {
    render(pager({ page: 0, pageCount: 4, total: 80 }))
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument()
    expect(screen.queryByText('pages skipped')).not.toBeInTheDocument()
  })

  it('keeps a gap that hides two or more pages', () => {
    render(pager({ page: 0, pageCount: 5, total: 100 }))
    expect(screen.queryByRole('button', { name: 'Page 3' })).not.toBeInTheDocument()
    expect(screen.getByText('pages skipped')).toBeInTheDocument()
  })

  it('shows every page when there are few, with no gap', () => {
    render(pager({ page: 1, pageCount: 4, total: 80 }))
    expect(screen.getAllByRole('button', { name: /^Page \d$/ })).toHaveLength(4)
  })

  it('ignores a numbered page while busy, and keeps it focusable', () => {
    const onPageChange = vi.fn()
    render(pager({ page: 0, busy: true, onPageChange }))
    const third = screen.getByRole('button', { name: 'Page 3' })
    expect(third).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(third)
    expect(onPageChange).not.toHaveBeenCalled()
  })
})
