// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RETENTION_UNAVAILABLE } from '../analysis/copy'
import { FileRetention } from './FileRetention'
import type { FileRetentionProps } from './FileRetention'

afterEach(() => {
  cleanup()
})

const KEEP = 'Keep original files in my library'

/** A page that holds whether the turn-off question is open, as ProfilePage does. */
function Host(props: Omit<FileRetentionProps, 'asking' | 'onAskingChange'>) {
  const [asking, setAsking] = useState(false)
  return <FileRetention {...props} asking={asking} onAskingChange={setAsking} />
}

function renderRetention(overrides: Partial<FileRetentionProps> = {}) {
  const onChange = vi.fn(async () => {})
  const props = {
    keepFiles: true,
    fileRetentionAvailable: true,
    storedFiles: 3,
    onChange,
    ...overrides,
  }
  render(<Host {...props} />)
  return { onChange, choice: screen.getByRole('checkbox', { name: KEEP }) }
}

describe('FileRetention', () => {
  it('shows the choice as checked, with what turning it off deletes as its description', () => {
    const { choice } = renderRetention()

    expect(choice).toBeChecked()
    expect(choice).toBeEnabled()
    expect(choice).toHaveAccessibleDescription(/Turning this off deletes saved originals/)
  })

  it('saves turning the choice on at once, without a confirmation', async () => {
    const { onChange, choice } = renderRetention({ keepFiles: false })

    fireEvent.click(choice)

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved. Original files will be kept in your library.',
      ),
    )
  })

  it('reports to its page when it asks, so the page can close what else is open', () => {
    const onAskingChange = vi.fn()
    render(
      <FileRetention
        keepFiles
        fileRetentionAvailable
        storedFiles={3}
        asking={false}
        onAskingChange={onAskingChange}
        onChange={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: KEEP }))

    expect(onAskingChange).toHaveBeenCalledWith(true)
  })

  it('asks before turning the choice off, naming the originals it deletes, and saves nothing yet', () => {
    const { onChange, choice } = renderRetention({ storedFiles: 3 })

    fireEvent.click(choice)

    const dialog = screen.getByRole('alertdialog', { name: 'Turn off keeping original files?' })
    expect(dialog).toHaveAccessibleDescription(
      /This deletes 3 stored original files\. Activity summaries stay\./,
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(choice).toBeChecked()
  })

  it('names a single stored original in the singular, in the question and in the outcome', async () => {
    const { onChange, choice } = renderRetention({ storedFiles: 1 })
    fireEvent.click(choice)

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      /This deletes 1 stored original file\. Activity summaries stay\./,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Turn off and delete' }))

    expect(onChange).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved. Original files are off. 1 stored original file was deleted; summaries stay.',
      ),
    )
  })

  it('turns the choice off and reports the files removed once the deletion is confirmed', async () => {
    const { onChange, choice } = renderRetention({ storedFiles: 2 })
    fireEvent.click(choice)

    fireEvent.click(screen.getByRole('button', { name: 'Turn off and delete' }))

    expect(onChange).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved. Original files are off. 2 stored original files were deleted; summaries stay.',
      ),
    )
  })

  it('leaves the choice on and calls nothing when the turn-off is cancelled, and returns focus to the checkbox', () => {
    const { onChange, choice } = renderRetention()

    fireEvent.click(choice)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(choice).toBeChecked()
    expect(choice).toHaveFocus()
  })

  it('needs no deleting copy when no originals are stored, and says so', async () => {
    const { onChange, choice } = renderRetention({ storedFiles: 0 })
    fireEvent.click(choice)

    const dialog = screen.getByRole('alertdialog', { name: 'Turn off keeping original files?' })
    expect(dialog).toHaveAccessibleDescription(/No original files are stored\./)
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved. Original files are off. Summaries stay.',
      ),
    )
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not claim a count it does not know, when the library has not loaded', async () => {
    const { choice } = renderRetention({ storedFiles: null })
    fireEvent.click(choice)

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      /This deletes any stored original files\./,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Turn off and delete' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved. Original files are off; summaries stay.',
      ),
    )
  })

  it('shows the new value at once while it saves, then keeps the saved one', async () => {
    let finish: () => void = () => undefined
    const onChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { choice } = renderRetention({ keepFiles: false, onChange })

    fireEvent.click(choice)
    expect(choice).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')

    await act(async () => finish())
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
  })

  it('reverts to the saved value and says so when the save fails', async () => {
    const onChange = vi.fn(async () => {
      throw new Error('Offline')
    })
    const { choice } = renderRetention({ keepFiles: false, onChange })

    fireEvent.click(choice)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't save. Try again."),
    )
    expect(choice).not.toBeChecked()
  })

  it('disables the choice and explains why, in plain text, when original storage is unavailable', () => {
    renderRetention({ fileRetentionAvailable: false })

    expect(screen.getByRole('checkbox', { name: KEEP })).toBeDisabled()
    const reason = screen.getByText(RETENTION_UNAVAILABLE)
    expect(reason).toBeVisible()
    expect(reason.closest('[role="status"]')).toBeNull()
  })

  it('leaves out the unavailable explanation when original storage is available', () => {
    renderRetention({ keepFiles: false })

    expect(screen.queryByText(RETENTION_UNAVAILABLE)).not.toBeInTheDocument()
  })
})
