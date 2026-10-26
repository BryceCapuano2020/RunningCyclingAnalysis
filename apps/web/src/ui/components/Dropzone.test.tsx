// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_ADVICE } from '../exportGuides'
import { STRIP_DELAY_MS } from './ImportStatus'
import { Dropzone } from './Dropzone'
import type { DropzoneProps } from './Dropzone'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function baseProps(): DropzoneProps {
  return {
    onFiles: vi.fn(),
    onSample: vi.fn(),
    onShowGuides: vi.fn(),
    busy: false,
    signedIn: false,
  }
}

function renderDropzone(overrides: Partial<DropzoneProps> = {}) {
  const props = { ...baseProps(), ...overrides }
  const view = render(<Dropzone {...props} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')
  const zone = view.container.querySelector<HTMLElement>('.dropzone')
  if (!input || !zone) throw new Error('drop zone missing')
  const choose = screen.getByRole('button', { name: 'Add files' })
  return { ...props, input, choose, zone }
}

function fitFile(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

describe('Dropzone', () => {
  it('asks for FIT, GPX or TCX files or a Strava zip, without saying drop them here', () => {
    renderDropzone()
    expect(
      screen.getByText('Add FIT, GPX or TCX files, or a Strava export zip'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Drop .* here/)).not.toBeInTheDocument()
  })

  it('says how much history to bring, under the title', () => {
    renderDropzone()
    expect(screen.getByText(HISTORY_ADVICE)).toBeInTheDocument()
  })

  it('makes Add files a real button, and the one primary action', () => {
    renderDropzone({ signedIn: false })
    expect(screen.getByRole('button', { name: 'Add files' })).toHaveClass('btn', 'btn-primary')
    expect(screen.getByRole('button', { name: 'See a sample athlete' })).not.toHaveClass(
      'btn-primary',
    )
  })

  it('draws an upload glyph on Add files, decoration only, not the Add files plus', () => {
    renderDropzone()
    const glyph = screen.getByRole('button', { name: 'Add files' }).querySelector('svg')
    expect(glyph).toHaveClass('icon')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
    expect(glyph?.innerHTML).not.toContain('M12 5v14')
  })

  it('does not make the whole drop area a button', () => {
    renderDropzone()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('leaves the privacy line to the footer, so it is not said twice', () => {
    renderDropzone({ signedIn: false })
    expect(screen.queryByText(/Your files never leave this device/)).not.toBeInTheDocument()
  })

  it('says that exports usually come from a computer, and includes the drag text for pointers', () => {
    renderDropzone()
    expect(screen.getByText('Exports usually come from a computer.')).toBeInTheDocument()
    expect(screen.getByText('Drag them onto this box, or')).toBeInTheDocument()
  })

  it('opens the file picker from Add files by click, Enter and Space', async () => {
    const user = userEvent.setup()
    const { input, choose } = renderDropzone()
    const pick = vi.spyOn(input, 'click')

    await user.click(choose)
    choose.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(pick).toHaveBeenCalledTimes(3)
  })

  it('still opens the file picker from Add files while busy', () => {
    const { input, choose } = renderDropzone({ busy: true })
    const pick = vi.spyOn(input, 'click')
    fireEvent.click(choose)
    expect(pick).toHaveBeenCalledTimes(1)
  })

  it('offers a way to get the files, which asks the page to show the guides', async () => {
    const user = userEvent.setup()
    const onShowGuides = vi.fn()
    renderDropzone({ onShowGuides })
    await user.click(screen.getByRole('button', { name: 'No files yet? How to get them' }))
    expect(onShowGuides).toHaveBeenCalledOnce()
  })

  it('calls onSample from the sample button', async () => {
    const user = userEvent.setup()
    const { onSample } = renderDropzone()
    await user.click(screen.getByRole('button', { name: 'See a sample athlete' }))
    expect(onSample).toHaveBeenCalledTimes(1)
  })

  it('leaves the sample out for a signed-in user, and keeps Add files', () => {
    renderDropzone({ signedIn: true })
    expect(screen.queryByRole('button', { name: 'See a sample athlete' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument()
  })

  it('marks only the sample button aria-disabled while busy, and ignores its clicks', async () => {
    const user = userEvent.setup()
    const { choose, onSample } = renderDropzone({ busy: true })
    const sample = screen.getByRole('button', { name: 'See a sample athlete' })
    expect(sample).toHaveAttribute('aria-disabled', 'true')
    expect(choose).not.toHaveAttribute('aria-disabled')
    await user.click(sample)
    expect(onSample).not.toHaveBeenCalled()
  })

  it('keeps focus on the sample button when its click starts the sample', async () => {
    const user = userEvent.setup()
    const onSample = vi.fn()
    const { rerender } = render(<Dropzone {...baseProps()} onSample={onSample} />)
    const sample = screen.getByRole('button', { name: 'See a sample athlete' })
    await user.click(sample)
    expect(onSample).toHaveBeenCalledTimes(1)

    // The sample starts, so the page turns busy. A disabled button would drop the focus it holds.
    rerender(<Dropzone {...baseProps()} onSample={onSample} busy />)
    expect(sample).toBeEnabled()
    expect(sample).toHaveFocus()
  })

  describe('the reason the sample is off', () => {
    const REASON = 'Available when the current import finishes.'

    it('shows only once the import has lasted as long as the busy strip waits, so a quick one does not flash it', () => {
      vi.useFakeTimers()
      renderDropzone({ busy: true })
      expect(screen.queryByText(REASON)).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(STRIP_DELAY_MS - 1))
      expect(screen.queryByText(REASON)).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByText(REASON)).toBeInTheDocument()
    })

    it('names that reason on the sample button once it shows', () => {
      vi.useFakeTimers()
      renderDropzone({ busy: true })
      act(() => vi.advanceTimersByTime(STRIP_DELAY_MS))
      expect(
        screen.getByRole('button', { name: 'See a sample athlete' }),
      ).toHaveAccessibleDescription(REASON)
    })

    it('hides the reason when the import ends, and waits the delay again on the next one', () => {
      vi.useFakeTimers()
      const view = render(<Dropzone {...baseProps()} busy />)
      act(() => vi.advanceTimersByTime(STRIP_DELAY_MS))
      expect(screen.getByText(REASON)).toBeInTheDocument()

      view.rerender(<Dropzone {...baseProps()} busy={false} />)
      expect(screen.queryByText(REASON)).not.toBeInTheDocument()

      view.rerender(<Dropzone {...baseProps()} busy />)
      expect(screen.queryByText(REASON)).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(STRIP_DELAY_MS))
      expect(screen.getByText(REASON)).toBeInTheDocument()
    })
  })

  it('gives no reason for an off sample while nothing is busy', () => {
    renderDropzone()
    expect(
      screen.queryByText('Available when the current import finishes.'),
    ).not.toBeInTheDocument()
  })

  it('has no live region or progress of its own, since ImportStatus owns them', () => {
    renderDropzone({ busy: true })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Analysing')).not.toBeInTheDocument()
  })

  it('passes the files chosen in the file input to onFiles', () => {
    const { input, onFiles } = renderDropzone()
    const files = [fitFile('ride.fit'), fitFile('export.zip')]
    fireEvent.change(input, { target: { files } })
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('does nothing when the file picker closes with no files', () => {
    const { input, onFiles } = renderDropzone()
    fireEvent.change(input, { target: { files: [] } })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('passes on a file chosen while busy, so no file is lost', () => {
    const { input, onFiles } = renderDropzone({ busy: true })
    const files = [fitFile('run.fit')]
    expect(input).not.toBeDisabled()
    fireEvent.change(input, { target: { files } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('shows a different look while a file is dragged over it', () => {
    const { choose, zone } = renderDropzone()
    const files = { types: ['Files'], files: [] }

    expect(zone).not.toHaveClass('dropzone--over')
    fireEvent.dragEnter(choose, { dataTransfer: files })
    expect(zone).toHaveClass('dropzone--over')
    fireEvent.dragLeave(choose)
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('highlights the drop box while busy when a file is dragged over it', () => {
    const { choose, zone } = renderDropzone({ busy: true })
    fireEvent.dragEnter(choose, { dataTransfer: { types: ['Files'], files: [] } })
    expect(zone).toHaveClass('dropzone--over')
  })

  it('clears the drop highlight when a file is dropped on the box', () => {
    const { choose, zone } = renderDropzone()
    fireEvent.dragEnter(choose, { dataTransfer: { types: ['Files'], files: [] } })
    expect(zone).toHaveClass('dropzone--over')
    fireEvent.drop(choose, { dataTransfer: { files: [fitFile('ride.fit')], types: ['Files'] } })
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('does not highlight for text or a link dragged across the drop box', () => {
    const { choose, zone } = renderDropzone()

    fireEvent.dragEnter(choose, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(zone).not.toHaveClass('dropzone--over')
    fireEvent.dragEnter(choose, { dataTransfer: { types: ['text/uri-list'], files: [] } })
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('still prevents the default for a text or link drag over the box, so the browser stays put', () => {
    const { choose } = renderDropzone()
    const dataTransfer = { types: ['text/uri-list'], files: [] }
    expect(fireEvent.dragOver(choose, { dataTransfer })).toBe(false)
  })
})
