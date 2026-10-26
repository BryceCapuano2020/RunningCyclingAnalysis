// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import { LibraryNotices } from './LibraryNotices'

afterEach(() => {
  cleanup()
})

/**
 * The library notices in a page whose busy flag and rebuild notice are state, as in the app. With
 * `rebuildStarts`, Update now makes the page busy in the same update as its click, as the app does.
 */
function Library({ rebuildStarts = true }: { rebuildStarts?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [rebuildNotice, setRebuildNotice] = useState<string | null>(null)
  const analysis = analysisStub({
    state: { outdatedActivities: 2 },
    busy,
    rebuildNotice,
    rebuildSavedActivities: () => {
      if (rebuildStarts) setBusy(true)
    },
  })
  return (
    <>
      <button type="button" onClick={() => setBusy(true)}>
        Start an import
      </button>
      <button type="button" onClick={() => setBusy(false)}>
        End the import
      </button>
      <button
        type="button"
        onClick={() => {
          setRebuildNotice('Rebuilt 2 saved activities.')
          setBusy(false)
        }}
      >
        End the rebuild
      </button>
      <LibraryNotices
        analysis={analysis}
        signedIn
        keepFiles
        fileRetentionAvailable
        onRetry={vi.fn()}
      />
    </>
  )
}

/** The region the rebuild outcome goes in. It is focusable and has no name of its own. */
function rebuildRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[role="status"][tabindex="-1"]')
  if (!region) throw new Error('no rebuild notice region')
  return region
}

describe('LibraryNotices: focus after a rebuild', () => {
  it('moves focus to the outcome of a rebuild that started', () => {
    render(<Library />)
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    expect(screen.getByRole('button', { name: 'Updating…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'End the rebuild' }))
    expect(rebuildRegion()).toHaveTextContent('Rebuilt 2 saved activities.')
    expect(rebuildRegion()).toHaveFocus()
  })

  it('keeps focus on Update now while the rebuild runs', async () => {
    const user = userEvent.setup()
    render(<Library />)
    const update = screen.getByRole('button', { name: 'Update now' })
    await user.click(update)

    expect(update).toHaveTextContent('Updating…')
    expect(update).toHaveFocus()
  })

  it('does not move focus to the outcome when the user has moved on before it ends', async () => {
    const user = userEvent.setup()
    render(<Library />)
    await user.click(screen.getByRole('button', { name: 'Update now' }))
    await user.click(screen.getByRole('button', { name: 'Start an import' }))

    fireEvent.click(screen.getByRole('button', { name: 'End the rebuild' }))
    expect(rebuildRegion()).not.toHaveFocus()
    expect(screen.getByRole('button', { name: 'Start an import' })).toHaveFocus()
  })

  it('ignores Update now while a rebuild is already running', () => {
    const rebuildSavedActivities = vi.fn()
    render(
      <LibraryNotices
        analysis={analysisStub({
          state: { outdatedActivities: 2 },
          busy: true,
          rebuildSavedActivities,
        })}
        signedIn
        keepFiles
        fileRetentionAvailable
        onRetry={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Updating…' }))
    expect(rebuildSavedActivities).not.toHaveBeenCalled()
  })

  it('does not move focus when the rebuild never started and a later import ends', () => {
    render(<Library rebuildStarts={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))

    fireEvent.click(screen.getByRole('button', { name: 'Start an import' }))
    fireEvent.click(screen.getByRole('button', { name: 'End the import' }))
    expect(rebuildRegion()).not.toHaveFocus()
  })
})

describe('LibraryNotices: counts', () => {
  it('says a single activity is missing its original file', () => {
    render(
      <LibraryNotices
        analysis={analysisStub({ missingOriginals: 1 })}
        signedIn
        keepFiles
        fileRetentionAvailable
        onRetry={vi.fn()}
      />,
    )
    expect(
      screen.getByText(
        '1 activity is missing its original file. Add its file again to restore the original.',
      ),
    ).toBeInTheDocument()
  })
})

describe('LibraryNotices: outdated saved activities', () => {
  function outdated(count: number, signedIn: boolean) {
    return (
      <LibraryNotices
        analysis={analysisStub({ state: { outdatedActivities: count } })}
        signedIn={signedIn}
        keepFiles={signedIn}
        fileRetentionAvailable
        onRetry={vi.fn()}
      />
    )
  }

  it('asks a signed-out visitor to add the file again, with no Update now button', () => {
    render(outdated(1, false))

    expect(
      screen.getByText(
        '1 activity kept in this browser was analysed by an older version of the app. Add its file again to include it.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
  })

  it('uses the plural for several activities kept in this browser, with no Update now button', () => {
    render(outdated(2, false))

    expect(
      screen.getByText(
        '2 activities kept in this browser were analysed by an older version of the app. Add their files again to include them.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
  })

  it('keeps the signed-in wording and the Update now button', () => {
    render(outdated(1, true))

    expect(
      screen.getByText('1 saved activity needs a quick update before it counts in these results.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument()
  })
})
