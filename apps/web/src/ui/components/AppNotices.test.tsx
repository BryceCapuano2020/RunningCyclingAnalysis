// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
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
    activitiesPage: false,
    ...overrides,
  }
}

/** The status regions on the page right now, before a message is put into one of them. */
function statusRegions(): Element[] {
  return Array.from(document.querySelectorAll('[role="status"]'))
}

describe('AppNotices live regions', () => {
  it('keeps every status region mounted and empty when there is nothing to say', () => {
    render(<AppNotices {...noticesProps()} />)

    const regions = statusRegions()
    expect(regions.length).toBeGreaterThan(0)
    for (const region of regions) expect(region).toBeEmptyDOMElement()
  })

  it('announces the sample athlete in a region that was already on the page', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    const regions = statusRegions()

    props.analysis.state = { ...props.analysis.state, result: makeResult(), isSample: true }
    view.rerender(<AppNotices {...props} />)

    const notice = screen.getByText(/Showing a sample athlete, a 37-year-old man at 75 kg\./)
    expect(regions).toContain(notice.closest('[role="status"]'))
  })

  it('shows the sample banner on screen, and says once that the sample is not kept', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    props.analysis.state = { ...props.analysis.state, result: makeResult(), isSample: true }
    view.rerender(<AppNotices {...props} />)

    const banner = screen.getByText(/The sample is not kept/)
    expect(banner).toBeVisible()
    expect(banner.className).toBe('sample-banner')
    expect(screen.getAllByText(/The sample is not kept/)).toHaveLength(1)
  })

  it('announces a neutral stop in a region that was already on the page, not as a fault', () => {
    const props = noticesProps()
    const view = render(<AppNotices {...props} />)
    const regions = statusRegions()

    props.analysis.error = "Stopped. Add your files again when you're ready."
    props.analysis.errorNeutral = true
    view.rerender(<AppNotices {...props} />)

    const notice = screen.getByText("Stopped. Add your files again when you're ready.")
    expect(regions).toContain(notice.closest('[role="status"]'))
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
          importOutcome: { activities: 1, rejected: 1, duplicates: [], runs: 1, rides: 0 },
        })}
      />,
    )

    expect(screen.getByText('Read 2 files: 1 saved, 1 needs a look.')).toBeInTheDocument()
  })
})

describe('AppNotices: the library on the Activities page', () => {
  it('says what is kept in this browser, without repeating the count the subtitle gives', () => {
    render(
      <AppNotices
        {...noticesProps(
          { savedActivities: [makeSaved(), makeSaved(), makeSaved()] },
          { activitiesPage: true },
        )}
      />,
    )
    expect(screen.getByText('Kept in this browser.')).toBeInTheDocument()
  })

  it('says the account holds the library when signed in', () => {
    render(
      <AppNotices
        {...noticesProps(
          { savedActivities: [makeSaved()] },
          { activitiesPage: true, signedIn: true },
        )}
      />,
    )
    expect(screen.getByText('Saved to your account.')).toBeInTheDocument()
  })

  it('says nothing about the library off the Activities page', () => {
    render(<AppNotices {...noticesProps({ savedActivities: [makeSaved()] })} />)
    expect(screen.queryByText(/Kept in this browser/)).not.toBeInTheDocument()
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
