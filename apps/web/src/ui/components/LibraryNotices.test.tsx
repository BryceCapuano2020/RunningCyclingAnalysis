// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORIGINALS_UNAVAILABLE } from '../analysis/copy'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisController } from '../useAnalysis'
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
    outdatedWithOriginal: 2,
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
  const region = document.querySelector<HTMLElement>('[tabindex="-1"]')
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
          outdatedWithOriginal: 2,
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
    expect(document.querySelector('[tabindex="-1"]')).toBeNull()
  })
})

describe('LibraryNotices: one line with Details', () => {
  it('shows a notice as a few words, with the full sentence under a Details disclosure', () => {
    const { container } = render(
      <LibraryNotices
        analysis={analysisStub({ missingOriginals: 3 })}
        signedIn
        keepFiles
        fileRetentionAvailable
        onRetry={vi.fn()}
      />,
    )
    const line = container.querySelector('summary')!
    expect(line).toHaveTextContent('3 activities missing the original file')
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    // The decoration is hidden from readers, so the line's name is its words.
    expect(line.querySelector('[aria-hidden="true"]')).toHaveTextContent('Details')
    expect(screen.getByText(/3 activities are missing their original file/)).toBeInTheDocument()
  })

  it('renders no region at all when there is nothing to say', () => {
    const { container } = render(
      <LibraryNotices
        analysis={analysisStub()}
        signedIn
        keepFiles
        fileRetentionAvailable
        onRetry={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
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
  function outdated(count: number, signedIn: boolean, withOriginal = count) {
    return (
      <LibraryNotices
        analysis={analysisStub({
          state: { outdatedActivities: count },
          outdatedWithOriginal: withOriginal,
        })}
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

  it('offers Update now when every outdated saved activity has its original file', () => {
    render(outdated(1, true))

    expect(
      screen.getByText('1 saved activity needs a quick update before it counts in these results.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument()
  })

  it('asks for the files again, with no Update now button, when none has its original file', () => {
    render(outdated(2, true, 0))

    expect(
      screen.getByText(
        '2 saved activities were analysed by an older version of the app. Add their files again to include them.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/quick update/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
  })

  it('updates only the ones with an original file and asks for the files of the rest', () => {
    render(outdated(3, true, 2))

    expect(
      screen.getByText(
        '2 saved activities need a quick update before they count in these results. 1 saved activity was analysed by an older version of the app. Add its file again to include it.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument()
  })

  it('does not count more updatable activities than are outdated', () => {
    render(outdated(1, true, 4))

    expect(
      screen.getByText('1 saved activity needs a quick update before it counts in these results.'),
    ).toBeInTheDocument()
  })

  it('explains a disabled Update now only when some activity can be updated', () => {
    const unavailable = (withOriginal: number) => (
      <LibraryNotices
        analysis={analysisStub({
          state: { outdatedActivities: 2 },
          outdatedWithOriginal: withOriginal,
        })}
        signedIn
        keepFiles
        fileRetentionAvailable={false}
        onRetry={vi.fn()}
      />
    )
    const { rerender } = render(unavailable(0))
    expect(screen.queryByText(ORIGINALS_UNAVAILABLE)).not.toBeInTheDocument()
    rerender(unavailable(2))
    expect(screen.getByText(ORIGINALS_UNAVAILABLE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled()
  })
})

describe('LibraryNotices: this browser could not keep or delete activities', () => {
  function shown(deviceIssue: AnalysisController['deviceIssue'], signedIn = false) {
    return (
      <LibraryNotices
        analysis={analysisStub({ deviceIssue })}
        signedIn={signedIn}
        keepFiles={false}
        fileRetentionAvailable
        onRetry={vi.fn()}
      />
    )
  }

  it('says a single activity shows but will not be here after a reload', () => {
    render(shown({ issue: 'notSaved', count: 1 }))

    expect(
      screen.getByText(
        '1 activity shows here but could not be kept in this browser. It will not be here after a reload.',
      ),
    ).toBeInTheDocument()
  })

  it('says several activities show but will not be here after a reload', () => {
    render(shown({ issue: 'notSaved', count: 3 }))

    expect(
      screen.getByText(
        '3 activities show here but could not be kept in this browser. They will not be here after a reload.',
      ),
    ).toBeInTheDocument()
  })

  it('says activities left to a newer version of the app are kept as they are', () => {
    render(shown({ issue: 'notSaved', count: 0, newer: 1 }))

    expect(
      screen.getByText(
        '1 activity shows here. This browser keeps a copy of it saved by a newer version of this app, and that copy was left as it is. Reload the page to update the app.',
      ),
    ).toBeInTheDocument()
  })

  it('says both when some were refused and some left to a newer version', () => {
    render(shown({ issue: 'notSaved', count: 1, newer: 2 }))

    expect(
      screen.getByText(
        '1 activity shows here but could not be kept in this browser. It will not be here after a reload. 2 activities show here. This browser keeps copies of them saved by a newer version of this app, and those copies were left as they are. Reload the page to update the app.',
      ),
    ).toBeInTheDocument()
  })

  it('says a signed-out visitor can remove everything again', () => {
    render(shown({ issue: 'notForgotten' }))

    expect(
      screen.getByText(
        'This browser could not delete its kept activities or recordings. Use Remove all my activities to try again.',
      ),
    ).toBeInTheDocument()
  })

  it('says the results kept here are no longer in it, without naming one cause', () => {
    render(shown({ issue: 'evicted' }))

    expect(
      screen.getByText(
        'The results you kept in this browser are no longer in it. Clearing site data, low storage or, in Safari, a week away can remove them. Add your files again. Sign in to keep your results on your account.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Your kept results were cleared')).toBeInTheDocument()
  })

  it('does not tell a signed-in visitor to sign in', () => {
    render(shown({ issue: 'evicted' }, true))
    expect(screen.queryByText(/Sign in to keep/)).not.toBeInTheDocument()
    cleanup()
    render(shown({ issue: 'mayBeCleared' }, true))
    expect(screen.queryByText(/Sign in to keep/)).not.toBeInTheDocument()
  })

  it('says a browser that did not promise to keep the results can lose them', () => {
    render(shown({ issue: 'mayBeCleared' }))

    expect(
      screen.getByText(
        'Your results are kept in this browser only, and it has not agreed to hold them. Clearing site data, low storage or, in Safari, a week away can remove them. Sign in to keep your results on your account.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('This browser may clear your results')).toBeInTheDocument()
  })

  it('says both when the kept results could not be read and the new files could not be kept', () => {
    render(shown({ issue: 'notSaved', count: 2, unread: true }))
    expect(screen.getByText(/shown on their own and are not added to them\./)).toBeInTheDocument()
    expect(screen.getByText(/2 activities show here but could not be kept/)).toBeInTheDocument()
    expect(screen.getByText('Kept results could not be read')).toBeInTheDocument()
  })

  it('says an import was analysed on its own because the kept results could not be read', () => {
    render(shown({ issue: 'notRead' }))
    expect(screen.getByText(/shown on their own and are not added to them/)).toBeInTheDocument()
  })

  it('says a signed-in delete left a copy in this browser', () => {
    render(shown({ issue: 'notForgotten' }, true))

    expect(
      screen.getByText(
        'This browser could not delete its copy of the activity or its recording. It may come back when you sign out.',
      ),
    ).toBeInTheDocument()
  })

  it('shows nothing when this browser refused nothing, and the notice once it did', () => {
    const { rerender } = render(shown(null))
    expect(
      screen.queryByRole('region', { name: 'Browser storage problem' }),
    ).not.toBeInTheDocument()

    rerender(shown({ issue: 'notForgotten' }))
    expect(screen.getByRole('region', { name: 'Browser storage problem' })).toBeInTheDocument()
  })
})

describe('LibraryNotices: the library page', () => {
  it('leaves out the update and newer-app notices while the library page says them itself', () => {
    render(
      <LibraryNotices
        analysis={analysisStub({
          state: { outdatedActivities: 2, incompatibleActivities: 1 },
          outdatedWithOriginal: 2,
        })}
        signedIn
        keepFiles
        fileRetentionAvailable
        panelShown
        onRetry={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Saved activity updates')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Incompatible saved activities')).not.toBeInTheDocument()
  })
})
