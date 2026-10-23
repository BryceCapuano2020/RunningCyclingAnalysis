// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedLibraryActivity } from './SavedLibrary'
import { SavedLibrary } from './SavedLibrary'

afterEach(() => cleanup())

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

describe('SavedLibrary', () => {
  it('shows every supplied saved activity with its date and sport', () => {
    const saved = activities(2)
    render(<SavedLibrary activities={saved} busy={false} onDelete={vi.fn()} />)

    expect(within(rowFor('Saved activity 0')).getByText('2026-01-01')).toBeInTheDocument()
    expect(within(rowFor('Saved activity 0')).getByText('Run')).toBeInTheDocument()
    expect(within(rowFor('Saved activity 1')).getByText('Ride')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Delete Saved activity/ })).toHaveLength(2)
  })

  it('cancels the named confirmation without deleting', () => {
    const onDelete = vi.fn()
    render(<SavedLibrary activities={activities(1)} busy={false} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Saved activity 0' }))
    const confirmation = screen.getByRole('group', { name: 'Delete “Saved activity 0”?' })
    expect(
      within(confirmation).getByText(
        /permanently deletes the activity’s original FIT file and saved summary/,
      ),
    ).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('group', { name: /Delete “Saved activity 0”/ }),
    ).not.toBeInTheDocument()
  })

  it('confirms deletion using the server record id and clears the confirmation', () => {
    const onDelete = vi.fn()
    render(<SavedLibrary activities={activities(2)} busy={false} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Saved activity 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))

    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith('saved-1')
    expect(
      screen.queryByRole('group', { name: /Delete “Saved activity 1”/ }),
    ).not.toBeInTheDocument()
  })

  it('paginates in pages of 20 and disables all mutations while busy', () => {
    const saved = activities(25)
    const onDelete = vi.fn()
    const { rerender } = render(
      <SavedLibrary activities={saved} busy={false} onDelete={onDelete} />,
    )

    expect(screen.getAllByRole('row')).toHaveLength(21)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 1–20 of 25 saved activities. Page 1 of 2.',
    )
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(rowFor('Saved activity 20')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Saved activity 0/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 21–25 of 25 saved activities. Page 2 of 2.',
    )
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Saved activity 20' }))
    rerender(<SavedLibrary activities={saved} busy onDelete={onDelete} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Saved activity 20' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('does not show pagination for a single page and has an empty state', () => {
    const { rerender } = render(
      <SavedLibrary activities={activities(20)} busy={false} onDelete={vi.fn()} />,
    )
    expect(
      screen.queryByRole('navigation', { name: 'Saved activity pages' }),
    ).not.toBeInTheDocument()

    rerender(<SavedLibrary activities={[]} busy={false} onDelete={vi.fn()} />)
    expect(screen.getByText('No saved activities')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
