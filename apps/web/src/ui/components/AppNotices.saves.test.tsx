// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import { waitingCount } from '../../worker/outbox'
import { AppNotices } from './AppNotices'
import type { AppNoticesProps } from './AppNotices'

vi.mock('../../worker/outbox', () => ({ waitingCount: vi.fn() }))

const ACCOUNT = { userId: 'u1', email: 'a@example.com' }

function props(analysis: AnalysisStubOverrides = {}): AppNoticesProps {
  return {
    analysis: analysisStub(analysis),
    signedIn: true,
    keepFiles: true,
    fileRetentionAvailable: true,
    accountUser: ACCOUNT,
    accountsUnavailable: false,
    accountError: null,
    runThenFocus: (action) => action(),
    moved: [],
    atBalance: false,
    page: 'balance',
    units: 'metric',
  }
}

beforeEach(() => {
  vi.mocked(waitingCount).mockReset()
  vi.mocked(waitingCount).mockResolvedValue(0)
})

afterEach(() => {
  cleanup()
})

/** The notices after an import of `uploaded` activities ended, as the page draws them. */
async function afterImport(saved: number, over: AnalysisStubOverrides) {
  const view = render(<AppNotices {...props({ uploading: 0 })} />)
  await act(async () =>
    view.rerender(<AppNotices {...props({ uploading: null, savedCount: saved, ...over })} />),
  )
  return view
}

describe('what a retry saved, said after an import that saved none', () => {
  it('counts the activities the retry stored, not "No new activities were saved"', async () => {
    const outbox = { pending: 0, saved: 2, failed: 0, finished: true }
    await afterImport(0, { outbox })

    expect(screen.getByText('Saved 2 activities to your library.')).toBeInTheDocument()
    expect(screen.queryByText(/No new activities were saved/)).not.toBeInTheDocument()
    // Said once: the import's line has the count, so the outbox line does not repeat it.
    expect(screen.queryByText(/from your last import/)).not.toBeInTheDocument()
  })

  it('adds them to what the import saved itself', async () => {
    const outbox = { pending: 0, saved: 2, failed: 0, finished: true }
    await afterImport(3, { outbox })

    expect(screen.getByText('Saved 5 activities to your library.')).toBeInTheDocument()
  })

  it('still says none were saved when the retry saved none', async () => {
    const outbox = { pending: 1, saved: 0, failed: 0, finished: true }
    await afterImport(0, { outbox })

    expect(screen.getByText('No new activities were saved to your library.')).toBeInTheDocument()
  })
})

describe('saves a reload found waiting', () => {
  it('shows the note and Try again now straight after load, from the rows the outbox holds', async () => {
    vi.mocked(waitingCount).mockResolvedValue(3)
    const resumeSaves = vi.fn()
    await act(async () => {
      render(<AppNotices {...props({ libraryStatus: 'loaded', resumeSaves })} />)
    })

    expect(waitingCount).toHaveBeenCalledWith('u1')
    expect(screen.getByText(/3 activities are waiting to be saved/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again now' }))
    expect(resumeSaves).toHaveBeenCalledOnce()
  })

  it('shows it when the library could not be loaded, so the resume never started', async () => {
    vi.mocked(waitingCount).mockResolvedValue(1)
    await act(async () => {
      render(<AppNotices {...props({ libraryStatus: 'failed' })} />)
    })

    expect(screen.getByText(/1 activity is waiting to be saved/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again now' })).toBeInTheDocument()
  })

  it('shows nothing while the library loads, which runs the outbox itself, nor with no rows', async () => {
    vi.mocked(waitingCount).mockResolvedValue(3)
    const loading = render(<AppNotices {...props({ libraryStatus: 'loading' })} />)
    await act(async () => undefined)
    expect(screen.queryByText(/waiting to be saved/)).not.toBeInTheDocument()
    loading.unmount()

    vi.mocked(waitingCount).mockResolvedValue(0)
    await act(async () => {
      render(<AppNotices {...props({ libraryStatus: 'loaded' })} />)
    })
    expect(screen.queryByText(/waiting to be saved/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again now' })).not.toBeInTheDocument()
  })

  it('leaves the worker its say once it has one, and gives the import failure its own button', async () => {
    vi.mocked(waitingCount).mockResolvedValue(3)
    const outbox = { pending: 1, saved: 0, failed: 0, finished: true }
    await act(async () => {
      render(<AppNotices {...props({ libraryStatus: 'loaded', outbox })} />)
    })
    expect(screen.getByText(/1 activity is waiting to be saved/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again now' })).toHaveLength(1)

    cleanup()
    await act(async () => {
      render(
        <AppNotices
          {...props({
            libraryStatus: 'loaded',
            state: { syncIssues: [{ code: 'server', count: 1 }] },
          })}
        />,
      )
    })
    expect(screen.queryByText(/waiting to be saved/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again now' })).toHaveLength(1)
  })

  it('says once that a save waits when a retry fails, not in the import’s sentence and again in the outbox’s', async () => {
    // The import's sentence is up, and the retry that failed left the outbox finished with the save still pending.
    const outbox = { pending: 1, saved: 0, failed: 0, finished: true }
    await act(async () => {
      render(
        <AppNotices
          {...props({
            libraryStatus: 'loaded',
            outbox,
            state: { syncIssues: [{ code: 'network', count: 1 }] },
          })}
        />,
      )
    })
    expect(screen.getAllByText(/saves when the connection returns/)).toHaveLength(1)
    expect(screen.queryByText(/waiting to be saved/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again now' })).toHaveLength(1)
  })

  it("forgets the last account's rows when another signs in", async () => {
    vi.mocked(waitingCount).mockResolvedValue(3)
    const view = render(<AppNotices {...props({ libraryStatus: 'loaded' })} />)
    await act(async () => undefined)
    expect(screen.getByText(/3 activities are waiting to be saved/)).toBeInTheDocument()

    // The other account's count is slow to arrive: the first account's rows are not shown under it.
    vi.mocked(waitingCount).mockReturnValue(new Promise(() => undefined))
    await act(async () =>
      view.rerender(
        <AppNotices
          {...props({ libraryStatus: 'loaded' })}
          accountUser={{ userId: 'u2', email: 'b@example.com' }}
        />,
      ),
    )

    expect(screen.queryByText(/waiting to be saved/)).not.toBeInTheDocument()
  })
})
