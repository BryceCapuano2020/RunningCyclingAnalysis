// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedLibraryActivity } from './SavedLibrary'
import { SavedLibrary } from './SavedLibrary'
import { readStylesheet, ruleBody } from './stylesheet'

const libraryCss = await readStylesheet(import.meta.url, './SavedLibrary.css')

afterEach(() => cleanup())

const idle = { status: null, error: null }

function activities(count: number): SavedLibraryActivity[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `saved-${index}`,
    name: `Saved activity ${index}`,
    startMs: Date.UTC(2026, 0, 1 + index, 12),
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
  const sport = index % 2 === 0 ? 'run' : 'ride'
  const day = String(index + 1).padStart(2, '0')
  return screen.getByRole('button', {
    name: `Delete Saved activity ${index}, ${sport}, 2026-01-${day}`,
  })
}

function paginationSummary(): HTMLElement {
  const nav = screen.getByRole('navigation', { name: 'Saved activity pages' })
  return within(nav).getByText(/^Showing /)
}

describe('SavedLibrary', () => {
  it('shows every supplied saved activity with its date and sport', () => {
    const saved = activities(2)
    render(<SavedLibrary activities={saved} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(within(rowFor('Saved activity 0')).getByText('2026-01-01')).toBeInTheDocument()
    expect(within(rowFor('Saved activity 0')).getByText('Run')).toBeInTheDocument()
    expect(within(rowFor('Saved activity 1')).getByText('Ride')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Delete Saved activity/ })).toHaveLength(2)
  })

  it('names each Delete button with its activity, sport and local date', () => {
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(
      screen.getByRole('button', { name: 'Delete Saved activity 0, run, 2026-01-01' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Delete Saved activity 1, ride, 2026-01-02' }),
    ).toBeInTheDocument()
  })

  it('cancels the named confirmation without deleting', () => {
    const onDelete = vi.fn()
    render(<SavedLibrary activities={activities(1)} busy={false} onDelete={onDelete} {...idle} />)

    fireEvent.click(deleteButtonFor(0))
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete “Saved activity 0”?' })
    expect(confirmation).toHaveAccessibleDescription(
      /permanently deletes the activity’s original FIT file and saved summary/,
    )
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('moves focus into the confirmation when it opens', () => {
    render(<SavedLibrary activities={activities(1)} busy={false} onDelete={vi.fn()} {...idle} />)

    fireEvent.click(deleteButtonFor(0))
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete “Saved activity 0”?' })
    expect(within(confirmation).getByRole('heading')).toHaveFocus()
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

  it('paginates in pages of 20 and disables all mutations while busy', () => {
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
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(deleteButtonFor(20)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(onDelete).not.toHaveBeenCalled()
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
        status="Deleted Saved activity 0 (2026-01-01)."
        error="Could not refresh the saved list."
      />,
    )

    expect(region()).toHaveFocus()
    expect(within(region()).getByText('No saved activities')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Saved activity 0 (2026-01-01).')
    expect(within(region()).getByRole('alert')).toHaveTextContent(
      'Could not refresh the saved list.',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps Tab inside the confirmation until it is closed', async () => {
    const user = userEvent.setup()
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={vi.fn()} {...idle} />)

    await user.click(deleteButtonFor(0))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete “Saved activity 0”?' })
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Delete permanently' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('heading')).toHaveFocus()
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

  it('stores the clamped page so a list that grows back does not jump to the old page', () => {
    const saved = activities(21)
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={vi.fn()} {...idle} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    rerender(
      <SavedLibrary activities={saved.slice(0, 20)} busy={false} onDelete={vi.fn()} {...idle} />,
    )
    rerender(<SavedLibrary activities={saved} busy={false} onDelete={vi.fn()} {...idle} />)

    expect(paginationSummary()).toHaveTextContent(
      'Showing 1–20 of 21 saved activities. Page 1 of 2.',
    )
    expect(rowFor('Saved activity 0')).toBeInTheDocument()
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
        status="Deleted Saved activity 0 (2026-01-01)."
        error={null}
      />,
    )
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Deleted Saved activity 0 (2026-01-01).')
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
