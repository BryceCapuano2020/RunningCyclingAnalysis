// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MovedItem } from '../analysis/whatMoved'
import { ImportStatus } from './ImportStatus'
import type { ImportStatusProps } from './ImportStatus'

afterEach(() => {
  cleanup()
})

function baseProps(): ImportStatusProps {
  return { onFiles: vi.fn(), busy: false, progress: null, signedIn: false }
}

function renderStatus(overrides: Partial<ImportStatusProps> = {}) {
  const props = { ...baseProps(), ...overrides }
  const view = render(<ImportStatus {...props} />)
  return { ...props, container: view.container }
}

function fitFile(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

/** Renders a different page beside the status, as the app does when its view changes. */
function Page({ view, ...props }: ImportStatusProps & { view: 'landing' | 'results' }) {
  return (
    <>
      <p>{view === 'landing' ? 'Landing' : 'Results'}</p>
      <ImportStatus {...props} />
    </>
  )
}

describe('ImportStatus: files dropped on the page', () => {
  it('accepts files dropped anywhere on the page, outside any drop box', () => {
    const { onFiles } = renderStatus()
    const files = [fitFile('ride.fit')]
    fireEvent.drop(window, { dataTransfer: { files, types: ['Files'] } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('passes a drop on an element to onFiles exactly once, as it bubbles to the window', () => {
    const { onFiles } = renderStatus()
    fireEvent.drop(screen.getByRole('status'), {
      dataTransfer: { files: [fitFile('run.fit')], types: ['Files'] },
    })
    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it('passes on a drop anywhere on the page while busy, so no file is lost', () => {
    const { onFiles } = renderStatus({ busy: true, progress: null })
    const files = [fitFile('ride.fit')]
    fireEvent.drop(window, { dataTransfer: { files, types: ['Files'] } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('ignores a drop that carries no files', () => {
    const { onFiles } = renderStatus()
    fireEvent.drop(window, { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('never lets the browser open a file dropped on the page', () => {
    renderStatus()
    const dataTransfer = { types: ['Files'], files: [fitFile('ride.fit')] }
    // fireEvent returns false when the event was cancelled with preventDefault.
    expect(fireEvent.dragOver(window, { dataTransfer })).toBe(false)
    expect(fireEvent.drop(window, { dataTransfer })).toBe(false)
  })

  it('leaves text dropped into a field to the browser, so the text lands in the field', () => {
    render(
      <>
        <input aria-label="Notes" />
        <ImportStatus {...baseProps()} />
      </>,
    )
    const field = screen.getByLabelText('Notes')
    const dataTransfer = { types: ['text/plain'], files: [] }
    // fireEvent returns false when a listener cancelled the event.
    expect(fireEvent.dragOver(field, { dataTransfer })).toBe(true)
    expect(fireEvent.drop(field, { dataTransfer })).toBe(true)
  })

  it('stops listening to the window once unmounted', () => {
    const { onFiles } = renderStatus()
    cleanup()
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [fitFile('run.fit')] } })
    expect(onFiles).not.toHaveBeenCalled()
  })
})

describe('ImportStatus: the drag overlay', () => {
  it('shows over the whole page while files are dragged across it', () => {
    renderStatus()
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('Drop to add files')).toBeInTheDocument()
    fireEvent.dragLeave(window)
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
  })

  it('ignores drags that carry no files', () => {
    renderStatus()
    fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
  })

  it('hides once a file is dropped', () => {
    renderStatus()
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('Drop to add files')).toBeInTheDocument()
    fireEvent.drop(window, { dataTransfer: { files: [fitFile('ride.fit')], types: ['Files'] } })
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
  })

  it('shows the overlay while busy too', () => {
    renderStatus({ busy: true, progress: null })
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('Drop to add files')).toBeInTheDocument()
  })
})

describe('ImportStatus: progress', () => {
  it('shows an indeterminate bar only while busy', () => {
    const idle = renderStatus()
    expect(idle.container.querySelector('.import-status__bar')).toBeNull()
    cleanup()
    const busy = renderStatus({ busy: true, progress: null })
    expect(busy.container.querySelector('.import-status__bar')).not.toBeNull()
  })

  it('shows no status when idle', () => {
    renderStatus()
    expect(screen.queryByText('Analysing')).not.toBeInTheDocument()
    expect(screen.queryByText(/so far/)).not.toBeInTheDocument()
  })

  it('says it is analysing while busy without progress', () => {
    renderStatus({ busy: true, progress: null })
    expect(screen.getByText('Analysing')).toHaveAttribute('aria-hidden', 'true')
  })

  it('says it is analysing when busy with zero files read', () => {
    renderStatus({ busy: true, progress: { filesRead: 0, filesTotal: null } })
    expect(screen.getByText('Analysing')).toBeInTheDocument()
  })

  it('reports the files read so far, hidden from screen readers so it never announces per file', () => {
    renderStatus({ busy: true, progress: { filesRead: 12, filesTotal: null } })
    expect(screen.getByText('Read 12 files so far')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses the singular when one file has been read', () => {
    renderStatus({ busy: true, progress: { filesRead: 1, filesTotal: null } })
    expect(screen.getByText('Read 1 file so far')).toBeInTheDocument()
  })

  it('says how many of the files are read when the total is known', () => {
    renderStatus({ busy: true, progress: { filesRead: 214, filesTotal: 1032 } })
    expect(screen.getByText('Reading 214 of 1,032 files')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses the singular for a total of one file', () => {
    renderStatus({ busy: true, progress: { filesRead: 1, filesTotal: 1 } })
    expect(screen.getByText('Reading 1 of 1 file')).toBeInTheDocument()
  })

  it('fills the bar to the share of the total that is read, and keeps it hidden from screen readers', () => {
    const { container } = renderStatus({
      busy: true,
      progress: { filesRead: 214, filesTotal: 1032 },
    })
    const bar = container.querySelector('.import-status__bar')
    const fill = container.querySelector('.import-status__fill')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(fill).toHaveClass('import-status__fill--measured')
    expect(fill).toHaveStyle({ width: '21%' })
  })

  it('keeps the bar indeterminate until the first file is read, not an empty measure at 0 of N', () => {
    const { container } = renderStatus({ busy: true, progress: { filesRead: 0, filesTotal: 10 } })
    const fill = container.querySelector('.import-status__fill')
    expect(fill).not.toHaveClass('import-status__fill--measured')
    expect(fill).not.toHaveStyle({ width: '0%' })
    expect(screen.getByText('Analysing')).toBeInTheDocument()
  })

  it('hides the progress strip once the import has ended, even when its count fell short', () => {
    const { container } = renderStatus({ busy: false, progress: { filesRead: 9, filesTotal: 10 } })
    expect(container.querySelector('.import-status')).toBeNull()
    expect(screen.queryByText(/Reading/)).not.toBeInTheDocument()
  })

  it('keeps the indeterminate bar and the count alone when the total is not known', () => {
    const { container } = renderStatus({
      busy: true,
      progress: { filesRead: 12, filesTotal: null },
    })
    expect(container.querySelector('.import-status__fill')).not.toHaveClass(
      'import-status__fill--measured',
    )
    expect(screen.getByText('Read 12 files so far')).toBeInTheDocument()
  })

  it('shows the count alone when more files are read than the total said there were', () => {
    renderStatus({ busy: true, progress: { filesRead: 5, filesTotal: 4 } })
    expect(screen.getByText('Read 5 files so far')).toBeInTheDocument()
  })

  it('does not announce the total as progress, so the live region stays as it was', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} />)
    rerender(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} busy progress={{ filesRead: 2, filesTotal: 9 }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading files')
    expect(screen.getByRole('status')).not.toHaveTextContent('of 9')
  })

  it('shows why busy imports are waiting, instead of saying it is analysing', () => {
    renderStatus({ busy: true, progress: null, waiting: 'Waiting for your library to load' })
    expect(screen.getByText('Waiting for your library to load')).toBeInTheDocument()
    expect(screen.queryByText('Analysing')).not.toBeInTheDocument()
  })
})

describe('ImportStatus: announcements', () => {
  it('keeps one always-mounted live region for analysis', () => {
    const { rerender, container } = render(<ImportStatus {...baseProps()} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)

    rerender(<ImportStatus {...baseProps()} busy progress={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading files')
    rerender(<ImportStatus {...baseProps()} busy progress={{ filesRead: 1, filesTotal: null }} />)
    rerender(<ImportStatus {...baseProps()} busy progress={{ filesRead: 2, filesTotal: null }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading files')
    expect(screen.getByRole('status')).not.toHaveTextContent('so far')

    rerender(
      <ImportStatus
        {...baseProps()}
        busy={false}
        progress={null}
        outcome={{ activities: 3, rejected: 0 }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Analysed 3 activities')
  })

  it('announces the reason when an import starts waiting', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        busy
        progress={null}
        waiting="Waiting for your library to load"
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your library to load')
  })

  it('leaves the final announcement of a signed-in import to the sync status', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} signedIn busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        signedIn
        busy={false}
        progress={null}
        outcome={{ activities: 3, rejected: 1 }}
      />,
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps the same live region when the view beneath it changes', () => {
    const { rerender } = render(<Page {...baseProps()} view="landing" busy progress={null} />)
    const region = screen.getByRole('status')
    rerender(<Page {...baseProps()} view="results" outcome={{ activities: 3, rejected: 0 }} />)
    // A region that is mounted with its text is not announced, so it must survive the switch.
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Analysed 3 activities')
  })

  it('announces the rejection summary with the outcome of a run', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        busy={false}
        progress={null}
        outcome={{ activities: 2, rejected: 1 }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Analysed 2 activities. 1 file could not be used.',
    )
  })

  it('says when nothing was analysed, with the number of files that could not be used', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        busy={false}
        progress={null}
        outcome={{ activities: 0, rejected: 2 }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'No activities were analysed. 2 files could not be used.',
    )
  })

  it('does not announce an outcome that is already there when the page loads', () => {
    render(<ImportStatus {...baseProps()} outcome={{ activities: 4, rejected: 0 }} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('ImportStatus: the summary of an import', () => {
  const MARCH_2023 = new Date(2023, 2, 4, 9).getTime()
  const OCTOBER_THIS_YEAR = new Date(new Date().getFullYear(), 9, 20, 7).getTime()
  const ADDED = {
    activities: 800,
    rejected: 0,
    runs: 412,
    rides: 388,
    firstStartMs: MARCH_2023,
    lastStartMs: OCTOBER_THIS_YEAR,
  }
  const SENTENCE = `Added 412 runs and 388 rides, from Mar 2023 to Oct ${new Date().getFullYear()}.`

  it('shows what an import added as a visible notice, not only to screen readers', () => {
    renderStatus({ outcome: ADDED })
    const notice = screen.getByText(SENTENCE)
    expect(notice.closest('[role="status"]')).toBeNull()
  })

  it('links to the balance from the other pages, but not from the balance page', () => {
    const { rerender } = render(<Page {...baseProps()} view="results" outcome={ADDED} />)
    expect(screen.getByRole('link', { name: 'See your balance' })).toHaveAttribute('href', '#/')

    rerender(<Page {...baseProps()} view="results" outcome={ADDED} atBalance />)
    expect(screen.queryByRole('link', { name: 'See your balance' })).not.toBeInTheDocument()
  })

  it('hides the notice while an import is still running', () => {
    renderStatus({ busy: true, progress: null, outcome: ADDED })
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument()
  })

  it('does not show a notice for an import that added no run or ride', () => {
    renderStatus({ outcome: { activities: 3, rejected: 0, runs: 0, rides: 0 } })
    expect(screen.queryByRole('button', { name: 'Dismiss import summary' })).not.toBeInTheDocument()
  })

  it('dismisses the notice, and keeps the sentence for screen readers', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} outcome={ADDED} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import summary' }))
    expect(screen.queryByRole('button', { name: 'Dismiss import summary' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(SENTENCE)
  })

  it('shows the notice again for the outcome of a later run', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} outcome={ADDED} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import summary' }))
    rerender(<ImportStatus {...baseProps()} outcome={{ ...ADDED }} />)
    expect(screen.getByRole('button', { name: 'Dismiss import summary' })).toBeInTheDocument()
  })

  it('moves focus to the page heading when the dismiss button had it', () => {
    render(
      <>
        <h1 id="page-heading" tabIndex={-1}>
          Balance
        </h1>
        <ImportStatus {...baseProps()} outcome={ADDED} />
      </>,
    )
    const dismiss = screen.getByRole('button', { name: 'Dismiss import summary' })
    dismiss.focus()
    fireEvent.click(dismiss)
    expect(screen.getByRole('heading', { name: 'Balance' })).toHaveFocus()
  })

  it('announces the same sentence when the run ends', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} outcome={ADDED} />)
    expect(screen.getByRole('status')).toHaveTextContent(SENTENCE)
  })
})

describe('ImportStatus: what moved', () => {
  const MARCH_2023 = new Date(2023, 2, 4, 9).getTime()
  const OCTOBER_THIS_YEAR = new Date(new Date().getFullYear(), 9, 20, 7).getTime()
  const ADDED = {
    activities: 800,
    rejected: 0,
    runs: 412,
    rides: 388,
    firstStartMs: MARCH_2023,
    lastStartMs: OCTOBER_THIS_YEAR,
  }
  const SENTENCE = `Added 412 runs and 388 rides, from Mar 2023 to Oct ${new Date().getFullYear()}.`
  const MOVED: MovedItem[] = [
    {
      text: 'Threshold pace: 7:12 → 7:05 /mi',
      spoken: 'Threshold pace from 7:12 to 7:05 per mile',
    },
    { text: 'New best 20 min ride: 262 W' },
  ]

  it('lists what moved under the summary sentence', () => {
    renderStatus({ outcome: ADDED, moved: MOVED })
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    const sentence = screen.getByText(SENTENCE)
    expect(sentence.closest('.import-status__notice')).toContainElement(list)
    expect(sentence.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hides each arrow from screen readers and says the change in words instead', () => {
    renderStatus({ outcome: ADDED, moved: MOVED })
    expect(screen.getByText('Threshold pace: 7:12 → 7:05 /mi')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByText('Threshold pace from 7:12 to 7:05 per mile')).toHaveClass('sr-only')
    expect(screen.getByText('New best 20 min ride: 262 W')).not.toHaveAttribute('aria-hidden')
  })

  it('shows no list when nothing moved', () => {
    renderStatus({ outcome: ADDED, moved: [] })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
  })

  it('announces that the numbers moved, after the outcome sentence', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} outcome={ADDED} moved={MOVED} />)
    expect(screen.getByRole('status').textContent).toBe(`${SENTENCE} Your numbers moved.`)
  })

  it('announces only the outcome sentence when nothing moved', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} outcome={ADDED} moved={[]} />)
    expect(screen.getByRole('status').textContent).toBe(SENTENCE)
  })

  it('removes the list with the summary when it is dismissed', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} outcome={ADDED} moved={MOVED} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import summary' }))
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('status').textContent).toBe(`${SENTENCE} Your numbers moved.`)
  })

  it('shows the list of a later import in place of the one dismissed', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} outcome={ADDED} moved={MOVED} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import summary' }))
    rerender(
      <ImportStatus
        {...baseProps()}
        outcome={{ ...ADDED }}
        moved={[{ text: 'New best 1 h ride: 210 W' }]}
      />,
    )
    expect(screen.getByText('New best 1 h ride: 210 W')).toBeInTheDocument()
    expect(screen.queryByText('New best 20 min ride: 262 W')).not.toBeInTheDocument()
  })
})

describe('ImportStatus: dismissal and what the summary adds', () => {
  const MOVED: MovedItem[] = [{ text: 'New best 20 min ride: 262 W' }]

  it('tells the page when the summary is dismissed', () => {
    const onDismiss = vi.fn()
    renderStatus({
      outcome: { activities: 2, rejected: 0, runs: 2, rides: 0, firstStartMs: 0, lastStartMs: 0 },
      onDismiss,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss import summary' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('says only the outcome, and lists nothing, when the import added no run or ride', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        outcome={{ activities: 1, rejected: 0, runs: 0, rides: 0 }}
        moved={MOVED}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe('Analysed 1 activity.')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
