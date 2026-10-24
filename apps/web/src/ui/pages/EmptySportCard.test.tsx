// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Period } from '@rca/core/period'
import { EmptySportCard } from './EmptySportCard'

afterEach(() => {
  cleanup()
})

const SIX_WEEKS: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

describe('EmptySportCard', () => {
  it('names the dated period and the count in All time when the library has the sport outside it', () => {
    render(<EmptySportCard sport="ride" inLibrary={14} period={SIX_WEEKS} onAddFiles={vi.fn()} />)
    const prompt = screen.getByRole('region', { name: 'Ride' })
    expect(
      within(prompt).getByText(
        'No rides between 12 May and 3 Aug 2025. You have 14 rides in All time.',
      ),
    ).toBeInTheDocument()
  })

  it('says the files have none, when the library has none of the sport', () => {
    render(<EmptySportCard sport="run" inLibrary={0} period={SIX_WEEKS} onAddFiles={vi.fn()} />)
    expect(
      screen.getByText('Your files have no runs yet. Add runs to see your records.'),
    ).toBeInTheDocument()
  })

  it('is a compact prompt rather than a card, so an empty sport takes little room', () => {
    const { container } = render(
      <EmptySportCard sport="run" inLibrary={0} period={SIX_WEEKS} onAddFiles={vi.fn()} />,
    )
    expect(container.querySelector('.card')).toBeNull()
    expect(container.querySelector('.empty-sport')).not.toBeNull()
  })

  it('offers a secondary Add button that opens the file chooser for the sport', () => {
    const onAddFiles = vi.fn()
    render(<EmptySportCard sport="ride" inLibrary={0} period={SIX_WEEKS} onAddFiles={onAddFiles} />)
    const add = screen.getByRole('button', { name: 'Add rides' })
    expect(add).toHaveClass('btn')
    expect(add).not.toHaveClass('btn-primary')

    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    const file = new File(['x'], 'ride.fit')
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } })
    expect(onAddFiles).toHaveBeenCalledWith([file])
  })

  it('links nowhere, since the sport page would be empty too', () => {
    render(<EmptySportCard sport="run" inLibrary={3} period={SIX_WEEKS} onAddFiles={vi.fn()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers the export guides beside the add action, as a secondary button too', () => {
    render(<EmptySportCard sport="ride" inLibrary={0} period={SIX_WEEKS} onAddFiles={vi.fn()} />)
    const guides = screen.getByRole('button', { name: 'How to get your files' })
    expect(guides).toHaveClass('btn')
    expect(guides).not.toHaveClass('btn-primary')
    expect(screen.getByRole('button', { name: 'Add rides' })).toBeInTheDocument()
  })
})
