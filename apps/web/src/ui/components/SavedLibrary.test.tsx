// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedLibraryActivity } from './SavedLibrary'
import { SavedLibrary } from './SavedLibrary'
import { readStylesheet, ruleBody } from './stylesheet'

const libraryCss = await readStylesheet(import.meta.url, './SavedLibrary.css')

// A fixed clock, so the year on each day does not depend on when the suite runs. Local dates keep
// the friendly day the same in every zone.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const idle = { status: null, error: null }

/** The friendly day formatDay shows for the activity at index in 2026, such as "Thu 1 Jan". */
function dayLabel(index: number): string {
  // 1 January 2026 is a Thursday, so each day after it moves one weekday on.
  const weekdays = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] as const
  return `${weekdays[index % 7]!} ${index + 1} Jan`
}

/** The sport name shown for the activity at index: even ones are runs, odd ones rides. */
function sportName(index: number): string {
  return index % 2 === 0 ? 'Run' : 'Ride'
}

function activities(count: number): SavedLibraryActivity[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `saved-${index}`,
    name: `Saved activity ${index}`,
    startMs: new Date(2026, 0, 1 + index, 12).getTime(),
    sport: index % 2 === 0 ? 'run' : 'ride',
  }))
}

function rowFor(name: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(name) })
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: 'Saved activities' })
}

function deleteButtonFor(index: number): HTMLElement {
  return screen.getByRole('button', {
    name: `Delete Saved activity ${index}, ${sportName(index)}, ${dayLabel(index)}`,
  })
}

/** The page summary. It sits beside the page buttons, and the status region announces outcomes. */
function paginationSummary(): HTMLElement {
  return screen.getByText(/^Showing /)
}

describe('SavedLibrary', () => {
  it('shows every supplied saved activity with its date and sport', () => {
    const saved = activities(2)
    render(<SavedLibrary activities={saved} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(within(rowFor('Saved activity 0')).getByText('Thu 1 Jan')).toBeInTheDocument()
    expect(within(rowFor('Saved activity 0')).getByText('Run')).toBeInTheDocument()
    expect(within(rowFor('Saved activity 1')).getByText('Ride')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Delete Saved activity/ })).toHaveLength(2)
  })

  it('names each Delete button with its activity, sport and friendly local date', () => {
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(
      screen.getByRole('button', { name: 'Delete Saved activity 0, Run, Thu 1 Jan' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Delete Saved activity 1, Ride, Fri 2 Jan' }),
    ).toBeInTheDocument()
  })

  it('adds the year to a day from an earlier year', () => {
    const older: SavedLibraryActivity[] = [
      { id: 'older', name: 'Older run', startMs: new Date(2025, 0, 2, 12).getTime(), sport: 'run' },
    ]
    render(<SavedLibrary activities={older} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(within(rowFor('Older run')).getByText('Thu 2 Jan 2025')).toBeInTheDocument()
  })

  it('cancels the named confirmation without deleting', () => {
    const onDelete = vi.fn()
    render(<SavedLibrary activities={activities(1)} busy={false} onDelete={onDelete} {...idle} />)

    fireEvent.click(deleteButtonFor(0))
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete “Saved activity 0”?' })
    expect(confirmation).toHaveAccessibleDescription(
      /permanently deletes the activity’s original file and saved summary/,
    )
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('closes the confirmation on Escape and returns focus to the row Delete button', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<SavedLibrary activities={activities(1)} busy={false} onDelete={onDelete} {...idle} />)

    await user.click(deleteButtonFor(0))
    await user.keyboard('{Escape}')

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteButtonFor(0)).toHaveFocus()
  })

  it('returns focus to the row Delete button when Cancel is pressed', () => {
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={vi.fn()} {...idle} />)

    fireEvent.click(deleteButtonFor(1))
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete “Saved activity 1”?' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

    expect(deleteButtonFor(1)).toHaveFocus()
  })

  it('moves focus to the heading of a confirmation opened for another activity', () => {
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={vi.fn()} {...idle} />)

    fireEvent.click(deleteButtonFor(0))
    fireEvent.click(deleteButtonFor(1))
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete “Saved activity 1”?' })
    expect(within(confirmation).getByRole('heading')).toHaveFocus()
  })

  it('confirms deletion using the server record id and clears the confirmation', () => {
    const onDelete = vi.fn()
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={onDelete} {...idle} />)

    fireEvent.click(deleteButtonFor(1))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))

    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith('saved-1')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('moves focus to the library region when a confirmed delete removes the row', () => {
    const onDelete = vi.fn()
    const saved = activities(2)
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={onDelete} {...idle} />,
    )

    fireEvent.click(deleteButtonFor(1))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(region()).toHaveFocus()

    rerender(
      <SavedLibrary activities={saved.slice(0, 1)} busy={false} onDelete={onDelete} {...idle} />,
    )
    expect(region()).toHaveFocus()
  })

  it('keeps the current page when a delete removes an activity from it', () => {
    const saved = activities(25)
    const onDelete = vi.fn()
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={onDelete} {...idle} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(deleteButtonFor(20))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    rerender(
      <SavedLibrary
        activities={saved.filter((activity) => activity.id !== 'saved-20')}
        busy={false}
        onDelete={onDelete}
        {...idle}
      />,
    )

    expect(paginationSummary()).toHaveTextContent(
      'Showing 21–24 of 24 saved activities. Page 2 of 2.',
    )
    expect(rowFor('Saved activity 21')).toBeInTheDocument()
  })

  it('moves to the last page that still exists when a delete empties the current page', () => {
    const saved = activities(21)
    const onDelete = vi.fn()
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={onDelete} {...idle} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(deleteButtonFor(20))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    rerender(
      <SavedLibrary activities={saved.slice(0, 20)} busy={false} onDelete={onDelete} {...idle} />,
    )

    expect(rowFor('Saved activity 0')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Saved activity 20/ })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Saved activity pages' }),
    ).not.toBeInTheDocument()
  })

  it('paginates in pages of 20 and blocks every change while busy', () => {
    const saved = activities(25)
    const onDelete = vi.fn()
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={onDelete} {...idle} />,
    )

    expect(screen.getAllByRole('row')).toHaveLength(21)
    expect(paginationSummary()).toHaveTextContent(
      'Showing 1–20 of 25 saved activities. Page 1 of 2.',
    )
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(rowFor('Saved activity 20')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Saved activity 0/ })).not.toBeInTheDocument()
    expect(paginationSummary()).toHaveTextContent(
      'Showing 21–25 of 25 saved activities. Page 2 of 2.',
    )
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    fireEvent.click(deleteButtonFor(20))
    rerender(<SavedLibrary activities={saved} busy onDelete={onDelete} {...idle} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(deleteButtonFor(20)).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('keeps focus on a row Delete button when the library turns busy', () => {
    const saved = activities(2)
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={vi.fn()} {...idle} />,
    )
    deleteButtonFor(0).focus()

    rerender(<SavedLibrary activities={saved} busy onDelete={vi.fn()} {...idle} />)
    expect(deleteButtonFor(0)).toHaveFocus()
  })

  it('does not open a confirmation from a Delete click while busy', () => {
    render(<SavedLibrary activities={activities(1)} busy onDelete={vi.fn()} {...idle} />)

    fireEvent.click(deleteButtonFor(0))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('moves focus to the first row of the page it moves to', () => {
    render(<SavedLibrary activities={activities(25)} busy={false} onDelete={vi.fn()} {...idle} />)

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(rowFor('Saved activity 20')).toHaveFocus()
  })

  it('does not show pagination for a single page', () => {
    render(<SavedLibrary activities={activities(20)} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(
      screen.queryByRole('navigation', { name: 'Saved activity pages' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the region, status and alert in place and shows an empty state after the last delete', () => {
    const onDelete = vi.fn()
    const { rerender } = render(
      <SavedLibrary activities={activities(1)} busy={false} onDelete={onDelete} {...idle} />,
    )

    fireEvent.click(deleteButtonFor(0))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    rerender(
      <SavedLibrary
        activities={[]}
        busy={false}
        onDelete={onDelete}
        status="Deleted Saved activity 0 (Thu 1 Jan)."
        error="Could not refresh the saved list."
      />,
    )

    expect(region()).toHaveFocus()
    expect(within(region()).getByText('No saved activities')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Saved activity 0 (Thu 1 Jan).')
    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'Could not refresh the saved list.',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('closes on Escape even when focus is outside the confirmation', () => {
    const onDelete = vi.fn()
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={onDelete} {...idle} />)

    fireEvent.click(deleteButtonFor(0))
    fireEvent.keyDown(deleteButtonFor(1), { key: 'Escape' })

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteButtonFor(0)).toHaveFocus()
  })

  it('closes and moves focus to the region when the activity disappears while confirming', () => {
    const onDelete = vi.fn()
    const saved = activities(2)
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={onDelete} {...idle} />,
    )

    fireEvent.click(deleteButtonFor(1))
    expect(
      screen.getByRole('alertdialog', { name: 'Delete “Saved activity 1”?' }),
    ).toBeInTheDocument()

    rerender(
      <SavedLibrary activities={saved.slice(0, 1)} busy={false} onDelete={onDelete} {...idle} />,
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(region()).toHaveFocus()

    rerender(<SavedLibrary activities={saved} busy={false} onDelete={onDelete} {...idle} />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('announces through the single status region, not the pagination summary', () => {
    render(<SavedLibrary activities={activities(25)} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(paginationSummary()).toHaveTextContent('Showing 1–20 of 25 saved activities.')
    expect(paginationSummary()).not.toHaveAttribute('aria-live')
  })

  it('keeps one persistent status element that announces the supplied message', () => {
    const { rerender } = render(
      <SavedLibrary activities={activities(1)} busy={false} onDelete={vi.fn()} {...idle} />,
    )

    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()

    rerender(
      <SavedLibrary
        activities={activities(1)}
        busy={false}
        onDelete={vi.fn()}
        status="Deleted Saved activity 0 (Thu 1 Jan)."
        error={null}
      />,
    )
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Deleted Saved activity 0 (Thu 1 Jan).')
  })

  it('notes the saved activities that could not be read, outside any alert or live region', () => {
    render(
      <SavedLibrary
        activities={activities(0)}
        busy={false}
        onDelete={vi.fn()}
        {...idle}
        unreadable={3}
      />,
    )

    expect(
      within(region()).getByText(
        '3 saved activities could not be read and are hidden. Re-adding their files will restore them.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses the singular for one saved activity that could not be read', () => {
    render(
      <SavedLibrary
        activities={activities(1)}
        busy={false}
        onDelete={vi.fn()}
        {...idle}
        unreadable={1}
      />,
    )
    expect(
      screen.getByText(
        '1 saved activity could not be read and is hidden. Re-adding its file will restore it.',
      ),
    ).toBeInTheDocument()
  })

  it('shows no note when every stored activity could be read', () => {
    render(<SavedLibrary activities={activities(1)} busy={false} onDelete={vi.fn()} {...idle} />)
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
  })

  it('shows a library action failure in an alert inside the region', () => {
    render(
      <SavedLibrary
        activities={activities(1)}
        busy={false}
        onDelete={vi.fn()}
        status={null}
        error="Could not delete Saved activity 0. Try again."
      />,
    )

    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'Could not delete Saved activity 0. Try again.',
    )
  })

  it('declares wrapping rules for the confirmation text', () => {
    const rule = ruleBody(libraryCss, '.saved-library__confirmation')
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule).toMatch(/min-width:\s*0/)
  })

  it('declares a focus indicator that stays visible for keyboard focus', () => {
    expect(libraryCss).not.toMatch(/\.saved-library:focus \{/)
    expect(ruleBody(libraryCss, '.saved-library:focus:not(:focus-visible)')).toMatch(
      /outline:\s*none/,
    )
  })
})
