// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dropzone } from './Dropzone'
import type { DropzoneProps } from './Dropzone'

afterEach(() => {
  cleanup()
})

function baseProps(): DropzoneProps {
  return { onFiles: vi.fn(), onSample: vi.fn(), busy: false, signedIn: false }
}

function renderDropzone(overrides: Partial<DropzoneProps> = {}) {
  const props = { ...baseProps(), ...overrides }
  const view = render(<Dropzone {...props} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')
  const zone = view.container.querySelector<HTMLElement>('.dropzone')
  if (!input || !zone) throw new Error('drop zone missing')
  const target = screen.getByRole('button', { name: /drop fit, gpx or tcx files/i })
  return { ...props, input, target, zone }
}

function fitFile(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

describe('Dropzone', () => {
  it('shows the drop instructions, the choose text and the privacy line', () => {
    renderDropzone()
    expect(
      screen.getByText('Drop FIT, GPX or TCX files, or a Strava export zip here'),
    ).toBeInTheDocument()
    expect(screen.getByText('or choose files')).toBeInTheDocument()
    expect(screen.getByText(/Your files never leave this device/)).toBeInTheDocument()
  })

  it('describes the signed-in library instead of promising local-only files', () => {
    renderDropzone({ signedIn: true })
    expect(
      screen.getByText(
        'Analysis runs in your browser. Activity summaries are saved to your library; original files only if you keep them.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Your files never leave this device/)).not.toBeInTheDocument()
  })

  it('keeps the local-only promise when signed out', () => {
    renderDropzone({ signedIn: false })
    expect(
      screen.getByText('Your files never leave this device. All analysis runs in your browser.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/saved to your library/)).not.toBeInTheDocument()
  })

  it('offers the sample athlete as the primary action only when signed out', () => {
    renderDropzone({ signedIn: false })
    expect(screen.getByRole('button', { name: 'See a sample athlete' })).toHaveClass(
      'btn',
      'btn-primary',
    )
    cleanup()
    renderDropzone({ signedIn: true })
    expect(screen.queryByRole('button', { name: 'See a sample athlete' })).not.toBeInTheDocument()
  })

  it('calls onSample from the sample button', async () => {
    const user = userEvent.setup()
    const { onSample } = renderDropzone()
    await user.click(screen.getByRole('button', { name: 'See a sample athlete' }))
    expect(onSample).toHaveBeenCalledTimes(1)
  })

  it('marks only the sample button aria-disabled while busy, and ignores its clicks', async () => {
    const user = userEvent.setup()
    const { target, onSample } = renderDropzone({ busy: true })
    const sample = screen.getByRole('button', { name: 'See a sample athlete' })
    expect(sample).toHaveAttribute('aria-disabled', 'true')
    expect(target).not.toHaveAttribute('aria-disabled')
    expect(target).toHaveAttribute('tabindex', '0')
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

  it('says why the sample is off while busy, and names that reason on the button', () => {
    renderDropzone({ busy: true })
    expect(
      screen.getByRole('button', { name: 'See a sample athlete' }),
    ).toHaveAccessibleDescription('Available when the current import finishes.')
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

  it('opens the file picker from the drop target by click, Enter and Space', () => {
    const { input, target } = renderDropzone()
    const pick = vi.spyOn(input, 'click')

    fireEvent.click(target)
    fireEvent.keyDown(target, { key: 'Enter' })
    fireEvent.keyDown(target, { key: ' ' })
    expect(pick).toHaveBeenCalledTimes(3)
  })

  it('ignores other keys on the drop target', () => {
    const { input, target } = renderDropzone()
    const pick = vi.spyOn(input, 'click')
    fireEvent.keyDown(target, { key: 'a' })
    expect(pick).not.toHaveBeenCalled()
  })

  it('still opens the file picker from the drop target while busy', () => {
    const { input, target } = renderDropzone({ busy: true })
    const pick = vi.spyOn(input, 'click')
    fireEvent.click(target)
    fireEvent.keyDown(target, { key: 'Enter' })
    expect(pick).toHaveBeenCalledTimes(2)
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
    const { target, zone } = renderDropzone()
    const files = { types: ['Files'], files: [] }

    expect(zone).not.toHaveClass('dropzone--over')
    fireEvent.dragEnter(target, { dataTransfer: files })
    expect(zone).toHaveClass('dropzone--over')
    fireEvent.dragLeave(target)
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('highlights the drop box while busy when a file is dragged over it', () => {
    const { target, zone } = renderDropzone({ busy: true })
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [] } })
    expect(zone).toHaveClass('dropzone--over')
  })

  it('clears the drop highlight when a file is dropped on the box', () => {
    const { target, zone } = renderDropzone()
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [] } })
    expect(zone).toHaveClass('dropzone--over')
    fireEvent.drop(target, { dataTransfer: { files: [fitFile('ride.fit')], types: ['Files'] } })
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('does not highlight for text or a link dragged across the drop box', () => {
    const { target, zone } = renderDropzone()

    fireEvent.dragEnter(target, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(zone).not.toHaveClass('dropzone--over')
    fireEvent.dragEnter(target, { dataTransfer: { types: ['text/uri-list'], files: [] } })
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('still prevents the default for a text or link drag over the box, so the browser stays put', () => {
    const { target } = renderDropzone()
    const dataTransfer = { types: ['text/uri-list'], files: [] }
    expect(fireEvent.dragOver(target, { dataTransfer })).toBe(false)
  })
})
