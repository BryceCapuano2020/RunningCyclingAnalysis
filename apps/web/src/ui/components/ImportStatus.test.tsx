// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    renderStatus({ busy: true, progress: 0 })
    expect(screen.getByText('Analysing')).toBeInTheDocument()
  })

  it('reports the files read so far, hidden from screen readers so it never announces per file', () => {
    renderStatus({ busy: true, progress: 12 })
    expect(screen.getByText('Read 12 files so far')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses the singular when one file has been read', () => {
    renderStatus({ busy: true, progress: 1 })
    expect(screen.getByText('Read 1 file so far')).toBeInTheDocument()
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
    rerender(<ImportStatus {...baseProps()} busy progress={1} />)
    rerender(<ImportStatus {...baseProps()} busy progress={2} />)
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
