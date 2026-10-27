// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MovedItem } from '../analysis/whatMoved'
import { ImportStatus } from './ImportStatus'
import type { ImportStatusProps } from './ImportStatus'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function baseProps(): ImportStatusProps {
  return { onFiles: vi.fn(), busy: false, progress: null, signedIn: false }
}

function renderStatus(overrides: Partial<ImportStatusProps> = {}) {
  const props = { ...baseProps(), ...overrides }
  const view = render(<ImportStatus {...props} />)
  return { ...props, container: view.container }
}

/** Lets the busy strip's 400 ms delay pass, as a run that has lasted that long would. */
function afterDelay() {
  act(() => {
    vi.advanceTimersByTime(400)
  })
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

describe('ImportStatus: the busy strip', () => {
  it('cancels the strip delay when the page unmounts before it ends', () => {
    const view = render(<ImportStatus {...baseProps()} busy progress={null} />)
    expect(vi.getTimerCount()).toBe(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows neither the strip nor Stop for work that ends within 400 ms', () => {
    const { container } = renderStatus({ busy: true, progress: { filesRead: 1, filesTotal: 9 } })
    act(() => {
      vi.advanceTimersByTime(399)
    })
    expect(container.querySelector('.import-status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop current analysis' })).toBeNull()
  })

  it('shows the strip and Stop once the work has lasted about 400 ms', () => {
    renderStatus({ busy: true, progress: { filesRead: 13, filesTotal: 23 } })
    afterDelay()
    expect(screen.getByText('Reading 13 of 23 files')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Stop current analysis' })).toBeVisible()
  })

  it('hides the strip again when the run ends, and starts the delay again on the next run', () => {
    const { rerender, container } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    afterDelay()
    expect(container.querySelector('.import-status')).not.toBeNull()

    rerender(<ImportStatus {...baseProps()} busy={false} progress={null} />)
    expect(container.querySelector('.import-status')).toBeNull()

    rerender(<ImportStatus {...baseProps()} busy progress={null} />)
    expect(container.querySelector('.import-status')).toBeNull()
    afterDelay()
    expect(container.querySelector('.import-status')).not.toBeNull()
  })

  it('passes the Stop button to onStop, so the page can keep focus where it belongs', () => {
    const onStop = vi.fn()
    renderStatus({ busy: true, progress: null, onStop })
    afterDelay()
    fireEvent.click(screen.getByRole('button', { name: 'Stop current analysis' }))
    expect(onStop).toHaveBeenCalledOnce()
    expect(onStop.mock.calls[0]?.[0]).toBeInstanceOf(Element)
  })

  it('says it is analysing while busy without progress', () => {
    renderStatus({ busy: true, progress: null })
    afterDelay()
    expect(screen.getByText('Analysing')).toHaveAttribute('aria-hidden', 'true')
  })

  it('says it is analysing when busy with zero files read', () => {
    renderStatus({ busy: true, progress: { filesRead: 0, filesTotal: null } })
    afterDelay()
    expect(screen.getByText('Analysing')).toBeInTheDocument()
  })

  it('reports the files read so far, hidden from screen readers so it never announces per file', () => {
    renderStatus({ busy: true, progress: { filesRead: 12, filesTotal: null } })
    afterDelay()
    expect(screen.getByText('Read 12 files so far')).toHaveAttribute('aria-hidden', 'true')
  })

  it('groups the files read so far from a thousand on', () => {
    renderStatus({ busy: true, progress: { filesRead: 1204, filesTotal: null } })
    afterDelay()
    expect(screen.getByText('Read 1,204 files so far')).toBeInTheDocument()
  })

  it('uses the singular when one file has been read', () => {
    renderStatus({ busy: true, progress: { filesRead: 1, filesTotal: null } })
    afterDelay()
    expect(screen.getByText('Read 1 file so far')).toBeInTheDocument()
  })

  it('says how many of the files are read when the total is known', () => {
    renderStatus({ busy: true, progress: { filesRead: 214, filesTotal: 1032 } })
    afterDelay()
    expect(screen.getByText('Reading 214 of 1,032 files')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses the singular for a total of one file', () => {
    renderStatus({ busy: true, progress: { filesRead: 1, filesTotal: 1 } })
    afterDelay()
    expect(screen.getByText('Reading 1 of 1 file')).toBeInTheDocument()
  })

  it('fills the bar to the share of the total that is read, and keeps it hidden from screen readers', () => {
    const { container } = renderStatus({
      busy: true,
      progress: { filesRead: 214, filesTotal: 1032 },
    })
    afterDelay()
    const bar = container.querySelector('.import-status__bar')
    const fill = container.querySelector('.import-status__fill')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(fill).toHaveClass('import-status__fill--measured')
    expect(fill).toHaveStyle({ width: '21%' })
  })

  it('keeps the bar indeterminate until the first file is read, not an empty measure at 0 of N', () => {
    const { container } = renderStatus({ busy: true, progress: { filesRead: 0, filesTotal: 10 } })
    afterDelay()
    const fill = container.querySelector('.import-status__fill')
    expect(fill).not.toHaveClass('import-status__fill--measured')
    expect(fill).not.toHaveStyle({ width: '0%' })
    expect(screen.getByText('Analysing')).toBeInTheDocument()
  })

  it('keeps the indeterminate bar and the count alone when the total is not known', () => {
    const { container } = renderStatus({
      busy: true,
      progress: { filesRead: 12, filesTotal: null },
    })
    afterDelay()
    expect(container.querySelector('.import-status__fill')).not.toHaveClass(
      'import-status__fill--measured',
    )
    expect(screen.getByText('Read 12 files so far')).toBeInTheDocument()
  })

  it('shows the count alone when more files are read than the total said there were', () => {
    renderStatus({ busy: true, progress: { filesRead: 5, filesTotal: 4 } })
    afterDelay()
    expect(screen.getByText('Read 5 files so far')).toBeInTheDocument()
  })

  it('shows a pause in the saves in the strip, with the count of files kept as the bar', () => {
    renderStatus({
      busy: true,
      progress: { filesRead: 3, filesTotal: 9 },
      waiting: 'Too many saves at once. Saving resumes in about a minute.',
    })
    afterDelay()
    expect(
      screen.getByText('Too many saves at once. Saving resumes in about a minute.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Reading 3 of 9 files')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop current analysis' })).toBeInTheDocument()
  })

  it('shows why busy imports are waiting, instead of saying it is analysing', () => {
    renderStatus({ busy: true, progress: null, waiting: 'Checking your saved results…' })
    afterDelay()
    expect(screen.getByText('Checking your saved results…')).toBeInTheDocument()
    expect(screen.queryByText('Analysing')).not.toBeInTheDocument()
  })
})

describe('ImportStatus: announcements', () => {
  it('announces that reading has started, once, and says nothing per file', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} />)
    rerender(<ImportStatus {...baseProps()} busy progress={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading files')
    rerender(<ImportStatus {...baseProps()} busy progress={{ filesRead: 2, filesTotal: 9 }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading files')
    expect(screen.getByRole('status')).not.toHaveTextContent('of 9')
  })

  it('shows no status when idle, and keeps one always-mounted live region', () => {
    const { container } = render(<ImportStatus {...baseProps()} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
  })

  it('clears the "Reading files" announcement when the run ends with no outcome to replace it', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} />)
    rerender(<ImportStatus {...baseProps()} busy progress={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading files')

    rerender(<ImportStatus {...baseProps()} busy={false} progress={null} />)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('clears the live region when a run ends in a stop, a fault or a start over, with no outcome', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} busy progress={{ filesRead: 3, filesTotal: 9 }} />)
    rerender(<ImportStatus {...baseProps()} busy={false} progress={null} outcome={null} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('announces the reason when an import starts waiting', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} />)
    rerender(
      <ImportStatus {...baseProps()} busy progress={null} waiting="Checking your saved results…" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Checking your saved results…')
  })

  it('announces a pause in the saves once, and again if there is a second', () => {
    const pause = 'Too many saves at once. Saving resumes in about a minute.'
    const { rerender } = render(<ImportStatus {...baseProps()} />)
    rerender(<ImportStatus {...baseProps()} busy progress={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading files')

    rerender(
      <ImportStatus
        {...baseProps()}
        busy
        progress={{ filesRead: 3, filesTotal: 9 }}
        waiting={pause}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(pause)

    // The counts move while it waits, and the region says nothing more.
    rerender(
      <ImportStatus
        {...baseProps()}
        busy
        progress={{ filesRead: 4, filesTotal: 9 }}
        waiting={pause}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(pause)

    // The next progress ends the pause, and the region is emptied, so the next one is read out too.
    rerender(<ImportStatus {...baseProps()} busy progress={{ filesRead: 5, filesTotal: 9 }} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    rerender(
      <ImportStatus
        {...baseProps()}
        busy
        progress={{ filesRead: 6, filesTotal: 9 }}
        waiting={pause}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(pause)
  })

  it('announces the outcome sentence once the run ends', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        busy={false}
        progress={null}
        outcome={{ activities: 3, rejected: 0, duplicates: [] }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nothing new: 3 activities already in your library.',
    )
  })

  it('announces where the files went with the same counts the summary shows', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        outcome={{
          activities: 2,
          filesAdded: 1,
          rejected: 1,
          duplicates: [{ fileName: 'copy.gpx', reason: 'r', code: 'duplicate' }],
        }}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Nothing new: 2 activities already in your library. 3 files: 1 added, 1 needs a look, 1 already added.',
    )
  })

  it('announces the other sports and unlisted files the summary names, so the headline is read whole', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        outcome={{ activities: 5, filesAdded: 5, rejected: 3, notActivities: 320, duplicates: [] }}
        rejected={[
          { fileName: 'a.fit', reason: 'r', code: 'unsupported-sport', detail: 'hiking' },
          { fileName: 'b.fit', reason: 'r', code: 'unsupported-sport', detail: 'walking' },
          { fileName: 'c.gpx', reason: 'r', code: 'empty' },
        ]}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Nothing new: 5 activities already in your library. 328 files: 5 added, 1 needs a look, 2 other sports left out on purpose, 320 not listed as activities.',
    )
  })

  it('announces nothing for an import a signed-in visitor sees summarised by the sync status', () => {
    const { rerender } = render(<ImportStatus {...baseProps()} signedIn busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        signedIn
        busy={false}
        progress={null}
        outcome={{ activities: 3, rejected: 1, duplicates: [] }}
      />,
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps the same live region when the view beneath it changes', () => {
    const { rerender } = render(<Page {...baseProps()} view="landing" busy progress={null} />)
    const region = screen.getByRole('status')
    rerender(
      <Page
        {...baseProps()}
        view="results"
        outcome={{ activities: 3, rejected: 0, duplicates: [] }}
      />,
    )
    // A region that is mounted with its text is not announced, so it must survive the switch.
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Nothing new: 3 activities already in your library')
  })

  it('does not announce an outcome that is already there when the page loads', () => {
    render(
      <ImportStatus {...baseProps()} outcome={{ activities: 4, rejected: 0, duplicates: [] }} />,
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('says what moved after the outcome sentence, and only for an import that added a run or ride', () => {
    const MOVED: MovedItem[] = [{ text: 'New best 20 min ride: 262 W' }]
    const ADDED = {
      activities: 2,
      rejected: 0,
      duplicates: [],
      runs: 2,
      rides: 0,
      firstStartMs: new Date(2023, 2, 4).getTime(),
      lastStartMs: new Date(2023, 2, 5).getTime(),
    }
    const { rerender } = render(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(<ImportStatus {...baseProps()} outcome={ADDED} moved={MOVED} />)
    expect(screen.getByRole('status').textContent).toMatch(
      /^Added 2 runs, in Mar 2023\. Your numbers moved\.$/,
    )

    rerender(<ImportStatus {...baseProps()} busy progress={null} />)
    rerender(
      <ImportStatus
        {...baseProps()}
        outcome={{ activities: 1, rejected: 0, duplicates: [], runs: 0, rides: 0 }}
        moved={MOVED}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Nothing new: 1 activity already in your library.',
    )
  })
})

describe('ImportStatus: the drag overlay', () => {
  it('shows the overlay again for each drag that crosses the page', () => {
    renderStatus()
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    fireEvent.dragLeave(window)
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('Drop to add files')).toBeInTheDocument()
  })
})
