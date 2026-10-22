// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SyncStatus } from './SyncStatus'
import type { SyncStatusProps } from './SyncStatus'

afterEach(() => {
  cleanup()
})

function props(overrides: Partial<SyncStatusProps> = {}): SyncStatusProps {
  return { uploading: null, failures: 0, signedIn: true, ...overrides }
}

describe('SyncStatus', () => {
  it('keeps one live status region mounted, empty when idle', () => {
    render(<SyncStatus {...props()} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('stays mounted and empty when signed out, even during an upload', () => {
    const { rerender } = render(<SyncStatus {...props({ signedIn: false })} />)
    rerender(<SyncStatus {...props({ signedIn: false, uploading: 0 })} />)
    rerender(<SyncStatus {...props({ signedIn: false, uploading: null, failures: 2 })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByText(/saved/)).not.toBeInTheDocument()
  })

  it('announces the start of an upload', () => {
    const { rerender } = render(<SyncStatus {...props()} />)
    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saving to your library')
  })

  it('keeps the live text fixed during the upload and shows the running count outside it', () => {
    const { rerender } = render(<SyncStatus {...props()} />)
    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 12 })} />)
    rerender(<SyncStatus {...props({ uploading: 13 })} />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/^Saving to your library$/)
    const count = screen.getByText('13 saved')
    expect(count).toHaveAttribute('aria-hidden', 'true')
    expect(status).not.toContainElement(count)
  })

  it('announces a finished upload with the saved count, in the singular and the plural', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 12 })} />)
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved 12 activities to your library')
    expect(screen.getByRole('status')).not.toHaveClass('sync-status__message--failed')
    expect(screen.queryByText('12 saved')).not.toBeInTheDocument()

    rerender(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 1 })} />)
    rerender(<SyncStatus {...props({ uploading: null })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved 1 activity to your library')
  })

  it('announces the failure sentence in place of the saved message when an import ends with failures', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: 3, failures: 1 })} />)
    rerender(<SyncStatus {...props({ uploading: null, failures: 1 })} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(
      '1 activity could not be fully saved. It is still analysed on this device. Re-import to retry; if an original exceeds 50 MiB, turn off file retention first.',
    )
    expect(status).toHaveClass('sync-status__message--failed')
  })

  it('uses the plural failure sentence for several failures', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 0 })} />)
    rerender(<SyncStatus {...props({ uploading: null, failures: 3 })} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      '3 activities could not be fully saved. They are still analysed on this device. Re-import to retry; if an original exceeds 50 MiB, turn off file retention first.',
    )
  })

  it('does not announce a start or finish for an upload that was already running on mount', () => {
    const { rerender } = render(<SyncStatus {...props({ uploading: 5 })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByText('5 saved')).toHaveAttribute('aria-hidden', 'true')

    rerender(<SyncStatus {...props({ uploading: 6 })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows no running count when no upload is in progress', () => {
    render(<SyncStatus {...props({ uploading: null })} />)
    expect(screen.queryByText(/saved$/)).not.toBeInTheDocument()
  })
})
