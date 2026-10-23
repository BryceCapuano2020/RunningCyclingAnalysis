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

    const notice = screen.getByText('Showing a sample athlete. Add your own files to replace it.')
    expect(regions).toContain(notice.closest('[role="status"]'))
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
      error: 'Analysis stopped. Re-import your files to continue.',
      workerStopped: true,
    })
    render(<AppNotices {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Restart analysis' }))

    expect(props.runThenFocus).toHaveBeenCalledOnce()
    expect(props.analysis.retryWorker).toHaveBeenCalledOnce()
  })

  it('offers to stop a busy analysis through the focus helper', () => {
    const props = noticesProps({ busy: true })
    render(<AppNotices {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Stop current analysis' }))

    expect(props.runThenFocus).toHaveBeenCalledOnce()
    expect(props.analysis.stop).toHaveBeenCalledOnce()
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

  it('says the library is unavailable when accounts cannot be reached', () => {
    render(<AppNotices {...noticesProps({}, { accountsUnavailable: true })} />)

    expect(
      screen.getByText(
        'Your library is unavailable right now. Analysis still runs in your browser and nothing is being saved.',
      ),
    ).toBeInTheDocument()
  })

  it('lists the files that could not be used', () => {
    render(<AppNotices {...noticesProps({ state: { rejected: [makeRejectedFile()] } })} />)

    expect(screen.getByText('1 file could not be used')).toBeInTheDocument()
  })
})
