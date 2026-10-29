// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import { WALKING_NOTE_PAGES } from '../analysis/walkingPaceCopy'
import { forgetSeenNotes } from '../aboutDataStore'
import { AppNotices } from './AppNotices'
import type { AppNoticesProps } from './AppNotices'
import { makeRejectedFile, makeResult } from './fixtures'

afterEach(() => {
  cleanup()
})

function noticesProps(
  analysis: AnalysisStubOverrides = {},
  overrides: Partial<Omit<AppNoticesProps, 'analysis'>> = {},
): AppNoticesProps {
  return {
    analysis: analysisStub(analysis),
    signedIn: false,
    keepFiles: false,
    fileRetentionAvailable: true,
    accountsUnavailable: false,
    accountError: null,
    runThenFocus: vi.fn((action: () => void) => action()),
    moved: [],
    atBalance: false,
    page: 'balance',
    ...overrides,
  }
}

/** The status regions on the page right now, before a message is put into one of them. */
function statusRegions(): Element[] {
  return Array.from(document.querySelectorAll('[role="status"]'))
}

describe('the walking pace line', () => {
  const WALKING = /saved runs are at walking pace/

  it('shows on the pages that list or analyse runs, and on no other', () => {
    const analysis = { state: { walkingPaceRuns: 3 } }
    const run = render(<AppNotices {...noticesProps(analysis, { walkingNote: true })} />)
    expect(screen.getByText(WALKING)).toBeInTheDocument()
    run.unmount()
    render(<AppNotices {...noticesProps(analysis)} />)
    expect(screen.queryByText(WALKING)).not.toBeInTheDocument()
  })

  it('is for the Run and Activities pages', () => {
    expect([...WALKING_NOTE_PAGES].sort()).toEqual(['activities', 'run'])
  })
})

describe('AppNotices live regions', () => {
  it('keeps one status region mounted and empty when there is nothing to say', () => {
    render(<AppNotices {...noticesProps()} />)

    const regions = statusRegions()
    expect(regions).toHaveLength(1)
    expect(regions[0]).toBeEmptyDOMElement()
  })

  it('has no empty live region beyond the one that announces the notices', () => {
    render(
      <AppNotices
        {...noticesProps({
          state: { result: makeResult(), isSample: true, walkingPaceRuns: 2 },
          libraryNotice: null,
        })}
      />,
    )
    const empty = Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).filter(
      (region) => region.textContent === '',
    )
    expect(empty).toHaveLength(0)
  })

  it('holds a notice that is added in that region, so it is announced when it appears', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    const [region] = statusRegions()

    props.analysis.state = { ...props.analysis.state, incompatibleActivities: 2 }
    view.rerender(<AppNotices {...props} />)

    expect(region).toContainElement(screen.getByText(/made by a newer version of this app/))
  })

  it('says how a deletion ended when no result is left for a page to say it on', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    const regions = statusRegions()

    props.analysis.libraryNotice = 'Deleted Morning run (20/10/2026).'
    view.rerender(<AppNotices {...props} />)

    const notice = screen.getByText('Deleted Morning run (20/10/2026).')
    expect(regions[0]).toContainElement(notice)

    props.analysis.libraryError = 'Could not delete Evening run. Try again.'
    view.rerender(<AppNotices {...props} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete Evening run. Try again.')
  })

  it('leaves the deletion outcome to the page when a result is on screen', () => {
    render(
      <AppNotices
        {...noticesProps({
          state: { result: makeResult() },
          libraryNotice: 'Deleted Morning run (20/10/2026).',
          libraryError: 'Could not delete Evening run. Try again.',
        })}
      />,
    )
    expect(screen.queryByText(/Deleted Morning run/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('announces the sample athlete in the region that was already on the page', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    const regions = statusRegions()

    props.analysis.state = { ...props.analysis.state, result: makeResult(), isSample: true }
    view.rerender(<AppNotices {...props} />)

    const notice = screen.getByText(/Sample athlete, a 37-year-old man at 75 kg\./)
    expect(regions[0]).toContainElement(notice)
  })

  it('shows the sample banner on screen, and says once that the sample is not kept', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    props.analysis.state = { ...props.analysis.state, result: makeResult(), isSample: true }
    view.rerender(<AppNotices {...props} />)

    const banner = screen.getByText(/Not kept: add files to replace it/)
    expect(banner).toBeVisible()
    expect(banner.className).toBe('sample-banner')
    expect(screen.getAllByText(/Not kept: add files to replace it/)).toHaveLength(1)
  })

  it('announces a neutral stop in the region that was already on the page, not as a fault', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    const regions = statusRegions()

    props.analysis.error = "Stopped. Add your files again when you're ready."
    props.analysis.errorNeutral = true
    view.rerender(<AppNotices {...props} />)

    const notice = screen.getByText("Stopped. Add your files again when you're ready.")
    expect(regions[0]).toContainElement(notice)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument()
  })
})

describe('AppNotices: one notice region', () => {
  it('holds the import summary and the other notices in one region under the header', () => {
    const { container } = render(
      <AppNotices
        {...noticesProps({
          importOutcome: { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 },
        })}
      />,
    )

    const regions = container.querySelectorAll('.app__notices')
    expect(regions).toHaveLength(1)
    expect(regions[0]).toContainElement(screen.getByText(/Nothing new: 2 activities/))
  })

  it('does not offer Stop here, where the busy strip offers it while work runs', () => {
    render(<AppNotices {...noticesProps({ busy: true })} />)
    expect(screen.queryByRole('button', { name: 'Stop current analysis' })).not.toBeInTheDocument()
  })

  it('counts the files an import could not use, and lists them in the summary', () => {
    render(
      <AppNotices
        {...noticesProps({
          state: { rejected: [makeRejectedFile()] },
          importOutcome: {
            activities: 1,
            filesAdded: 1,
            rejected: 1,
            duplicates: [],
            runs: 1,
            rides: 0,
          },
        })}
      />,
    )

    expect(screen.getByText('1 file needs a look')).toBeInTheDocument()
  })
})

describe('AppNotices: the sample athlete across pages', () => {
  function sampleProps() {
    return noticesProps({ state: { result: makeResult(), isSample: true } })
  }

  it('shows the full banner on the first page and a small pill on the pages after', () => {
    const props = sampleProps()
    const view = render(<AppNotices {...props} />)
    expect(screen.getByText(/Not kept: add files to replace it/)).toBeVisible()

    view.rerender(<AppNotices {...props} page="run" />)
    expect(screen.queryByText(/Not kept: add files to replace it/)).not.toBeInTheDocument()
    const pill = screen.getByRole('button', { name: 'Sample athlete' })
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    expect(statusRegions()[0]).not.toContainElement(pill)

    fireEvent.click(pill)
    expect(screen.getByText(/Not kept: add files to replace it/)).toBeVisible()
    expect(pill).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not bring the banner back when the visitor returns to the first page', () => {
    const props = sampleProps()
    const view = render(<AppNotices {...props} />)
    view.rerender(<AppNotices {...props} page="run" />)
    view.rerender(<AppNotices {...props} page="balance" />)

    expect(screen.queryByText(/Not kept: add files to replace it/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sample athlete' })).toBeInTheDocument()
  })

  it('shows the banner again for a new sample, after the sample has gone', () => {
    const props = sampleProps()
    const view = render(<AppNotices {...props} />)
    view.rerender(<AppNotices {...props} page="run" />)
    props.analysis.state = { ...props.analysis.state, isSample: false }
    view.rerender(<AppNotices {...props} page="run" />)
    props.analysis.state = { ...props.analysis.state, isSample: true }
    view.rerender(<AppNotices {...props} page="run" />)

    expect(screen.getByText(/Not kept: add files to replace it/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Sample athlete' })).not.toBeInTheDocument()
  })
})

describe('AppNotices: About your data', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('says nothing of where the library is kept: the footer does, once, for every page', () => {
    render(
      <AppNotices
        {...noticesProps({ savedActivities: [makeSaved(), makeSaved()] }, { page: 'activities' })}
      />,
    )
    expect(screen.queryByText(/Kept in this browser/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Saved to your account/)).not.toBeInTheDocument()
  })

  it('puts the walking pace line under one About your data disclosure', () => {
    render(
      <AppNotices
        {...noticesProps({ state: { walkingPaceRuns: 38 } }, { page: 'run', walkingNote: true })}
      />,
    )
    const details = screen.getByText('About your data').closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText(/38 saved runs are at walking pace/)).toBeInTheDocument()
  })

  it('does not show a line the visitor has already seen on an earlier visit', () => {
    const analysis = { state: { walkingPaceRuns: 38 } }
    const first = render(<AppNotices {...noticesProps(analysis, { walkingNote: true })} />)
    expect(screen.getByText('About your data')).toBeInTheDocument()
    first.unmount()

    // A later visit opens the app again.
    render(<AppNotices {...noticesProps(analysis, { walkingNote: true })} />)
    expect(screen.queryByText('About your data')).not.toBeInTheDocument()
  })

  it('keeps a stable id and the count it said, not the sentence', () => {
    render(
      <AppNotices {...noticesProps({ state: { walkingPaceRuns: 38 } }, { walkingNote: true })} />,
    )
    expect(JSON.parse(window.localStorage.getItem('rca.aboutDataSeen') ?? '{}')).toEqual({
      walking: 38,
    })
  })

  it('shows the line again once what this browser noted has been forgotten', () => {
    const analysis = { state: { walkingPaceRuns: 38 } }
    render(<AppNotices {...noticesProps(analysis, { walkingNote: true })} />)
    cleanup()
    forgetSeenNotes()
    render(<AppNotices {...noticesProps(analysis, { walkingNote: true })} />)
    expect(screen.getByText('About your data')).toBeInTheDocument()
  })

  it('shows the line again when what it says changes', () => {
    const first = render(
      <AppNotices {...noticesProps({ state: { walkingPaceRuns: 38 } }, { walkingNote: true })} />,
    )
    first.unmount()

    render(
      <AppNotices {...noticesProps({ state: { walkingPaceRuns: 40 } }, { walkingNote: true })} />,
    )
    expect(screen.getByText(/40 saved runs are at walking pace/)).toBeInTheDocument()
  })

  it('keeps the line for the rest of the visit it was first shown on', () => {
    const props = noticesProps({ state: { walkingPaceRuns: 38 } }, { walkingNote: true })
    const view = render(<AppNotices {...props} />)
    view.rerender(<AppNotices {...props} page="run" />)
    expect(screen.getByText(/38 saved runs are at walking pace/)).toBeInTheDocument()
  })
})

describe('AppNotices: where detailed readings stop', () => {
  const imported = { activities: 2, rejected: 0, duplicates: [], runs: 2, rides: 0 }

  it('says how many activities have detailed readings, and how far back the newest go', () => {
    render(
      <AppNotices
        {...noticesProps({
          importOutcome: imported,
          savedActivities: [makeSaved(), makeSaved(), makeSaved()],
          detail: { ids: new Set(['a', 'b']), oldestStartMs: Date.UTC(2024, 2, 5) },
        })}
      />,
    )
    expect(screen.getByText('Detail kept for 2 of 3')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Detailed readings kept for 2 of your activities, the newest back to Mar 2024. Others keep their summaries, bests and splits.',
      ),
    ).toBeInTheDocument()
  })

  it('leaves the line out when every activity has them, or when storage has not said', () => {
    const everything = render(
      <AppNotices
        {...noticesProps({
          importOutcome: imported,
          savedActivities: [makeSaved(), makeSaved()],
          detail: { ids: new Set(['a', 'b']), oldestStartMs: Date.UTC(2024, 2, 5) },
        })}
      />,
    )
    expect(screen.queryByText(/Detailed readings kept/)).not.toBeInTheDocument()
    everything.unmount()
    render(
      <AppNotices
        {...noticesProps({ importOutcome: imported, savedActivities: [makeSaved()], detail: null })}
      />,
    )
    expect(screen.queryByText(/Detailed readings kept/)).not.toBeInTheDocument()
  })
})

describe('AppNotices alerts and actions', () => {
  it('puts an analysis error in an alert, prefixed with what went wrong', () => {
    render(<AppNotices {...noticesProps({ error: 'The file could not be read.' })} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong: The file could not be read.',
    )
  })

  it('shows a daily-limit error as it is, without the prefix', () => {
    render(
      <AppNotices
        {...noticesProps({
          error: 'You have reached the daily limit for this account.',
          errorIssue: 'daily-limit',
        })}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/^You have reached the daily limit/)
    expect(alert).not.toHaveTextContent('Something went wrong')
  })

  it('offers a restart once the worker has stopped, and runs it through the focus helper', () => {
    const props = noticesProps({
      error: 'Analysis stopped unexpectedly. Add the files again.',
      workerStopped: true,
    })
    render(<AppNotices {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Restart analysis' }))

    expect(props.runThenFocus).toHaveBeenCalledOnce()
    expect(props.analysis.retryWorker).toHaveBeenCalledOnce()
  })

  it('shows an account error only when accounts are available', () => {
    const { unmount } = render(
      <AppNotices {...noticesProps({}, { accountError: 'Your profile could not be saved.' })} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Your profile could not be saved.')
    unmount()

    render(
      <AppNotices
        {...noticesProps(
          {},
          { accountError: 'Your profile could not be saved.', accountsUnavailable: true },
        )}
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows no banner about sign-in when accounts cannot be reached, since the header says so', () => {
    render(<AppNotices {...noticesProps({}, { accountsUnavailable: true })} />)

    expect(screen.queryByText(/Sign-in is unavailable/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/** A saved activity, for the library count. */
function makeSaved() {
  return {
    id: 'a',
    name: 'Run',
    startMs: 0,
    sport: 'run' as const,
    copy: { id: 'a', rank: 3, hasPower: false, hasHeartRate: false, durationS: 60 },
  }
}
