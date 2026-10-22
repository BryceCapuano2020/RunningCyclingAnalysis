// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dropzone } from './Dropzone'
import type { DropzoneProps } from './Dropzone'

afterEach(() => {
  cleanup()
})

function renderDropzone(overrides: Partial<DropzoneProps> = {}) {
  const props = {
    onFiles: vi.fn(),
    onSample: vi.fn(),
    busy: false,
    progress: null,
    ...overrides,
  }
  const view = render(<Dropzone {...props} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input missing')
  const target = screen.queryByRole('button', { name: /drop fit files/i })
  return { ...props, container: view.container, input, target }
}

function fitFile(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

describe('Dropzone', () => {
  it('compact: accepts files dropped anywhere on the page', () => {
    const { onFiles } = renderDropzone({ compact: true })
    const files = [fitFile('ride.fit')]
    fireEvent.drop(window, { dataTransfer: { files, types: ['Files'] } })
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('compact: shows a page overlay while a file is dragged over the window', () => {
    renderDropzone({ compact: true })
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('Drop to add files')).toBeInTheDocument()
    fireEvent.dragLeave(window)
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
  })

  it('compact: ignores drags that carry no files', () => {
    renderDropzone({ compact: true })
    fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Drop to add files')).not.toBeInTheDocument()
  })

  it('compact: shows the overlay and passes on drops while busy', () => {
    const { onFiles } = renderDropzone({ compact: true, busy: true, progress: null })
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('Drop to add files')).toBeInTheDocument()
    const files = [fitFile('run.fit')]
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('compact: stops listening to the window once unmounted', () => {
    const { onFiles } = renderDropzone({ compact: true })
    cleanup()
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [fitFile('run.fit')] } })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('shows the drop instructions, the choose text and the privacy line', () => {
    renderDropzone()
    expect(screen.getByText('Drop FIT files or a Strava export zip here')).toBeInTheDocument()
    expect(screen.getByText('or choose files')).toBeInTheDocument()
    expect(screen.getByText(/Your files never leave this device/)).toBeInTheDocument()
  })

  it('calls onSample from the sample button', async () => {
    const user = userEvent.setup()
    const { onSample } = renderDropzone()
    await user.click(screen.getByRole('button', { name: 'Try sample data' }))
    expect(onSample).toHaveBeenCalledTimes(1)
  })

  it('opens the file picker from the drop target by click, Enter and Space', () => {
    const { input, target } = renderDropzone()
    const pick = vi.spyOn(input, 'click')
    if (!target) throw new Error('drop target missing')

    fireEvent.click(target)
    fireEvent.keyDown(target, { key: 'Enter' })
    fireEvent.keyDown(target, { key: ' ' })
    expect(pick).toHaveBeenCalledTimes(3)
  })

  it('ignores other keys on the drop target', () => {
    const { input, target } = renderDropzone()
    const pick = vi.spyOn(input, 'click')
    if (!target) throw new Error('drop target missing')
    fireEvent.keyDown(target, { key: 'a' })
    expect(pick).not.toHaveBeenCalled()
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

  it('passes dropped files to onFiles', () => {
    const { target, onFiles } = renderDropzone()
    if (!target) throw new Error('drop target missing')
    const files = [fitFile('run.fit')]
    fireEvent.drop(target, { dataTransfer: { files } })
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('passes a drop on the drop target to onFiles exactly once', () => {
    const { target, onFiles } = renderDropzone()
    if (!target) throw new Error('drop target missing')
    fireEvent.drop(target, { dataTransfer: { files: [fitFile('run.fit')], types: ['Files'] } })
    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it('accepts files dropped anywhere on the page, outside the drop box', () => {
    const { onFiles } = renderDropzone()
    const files = [fitFile('ride.fit')]
    fireEvent.drop(window, { dataTransfer: { files, types: ['Files'] } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('passes on a drop anywhere on the page while busy, so no file is lost', () => {
    const { onFiles } = renderDropzone({ busy: true, progress: null })
    const files = [fitFile('ride.fit')]
    fireEvent.drop(window, { dataTransfer: { files, types: ['Files'] } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('highlights the drop box while busy when a file is dragged over it', () => {
    const { container, target } = renderDropzone({ busy: true, progress: null })
    const zone = container.querySelector('.dropzone')
    if (!target || !zone) throw new Error('drop zone missing')
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [] } })
    expect(zone).toHaveClass('dropzone--over')
  })

  it('clears the drop highlight when a file is dropped outside the box', () => {
    const { container, target } = renderDropzone()
    const zone = container.querySelector('.dropzone')
    if (!target || !zone) throw new Error('drop zone missing')
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'], files: [] } })
    expect(zone).toHaveClass('dropzone--over')
    fireEvent.drop(window, { dataTransfer: { files: [fitFile('ride.fit')], types: ['Files'] } })
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it.each([
    { compact: false, label: 'landing page' },
    { compact: true, label: 'results toolbar' },
  ])('never lets the browser open a file dropped on the page ($label)', ({ compact }) => {
    renderDropzone({ compact })
    const dataTransfer = { types: ['Files'], files: [fitFile('ride.fit')] }
    // fireEvent returns false when the event was cancelled with preventDefault.
    expect(fireEvent.dragOver(window, { dataTransfer })).toBe(false)
    expect(fireEvent.drop(window, { dataTransfer })).toBe(false)
  })

  it('shows a different look while a file is dragged over it', () => {
    const { container, target } = renderDropzone()
    const zone = container.querySelector('.dropzone')
    if (!target || !zone) throw new Error('drop zone missing')
    const files = { types: ['Files'], files: [] }

    expect(zone).not.toHaveClass('dropzone--over')
    fireEvent.dragEnter(target, { dataTransfer: files })
    expect(zone).toHaveClass('dropzone--over')
    fireEvent.dragLeave(target)
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('does not highlight for text or a link dragged across the drop box', () => {
    const { container, target } = renderDropzone()
    const zone = container.querySelector('.dropzone')
    if (!target || !zone) throw new Error('drop zone missing')

    fireEvent.dragEnter(target, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(zone).not.toHaveClass('dropzone--over')
    fireEvent.dragEnter(target, { dataTransfer: { types: ['text/uri-list'], files: [] } })
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('still prevents the default for a text or link drag over the box, so the browser stays put', () => {
    const { target } = renderDropzone()
    if (!target) throw new Error('drop target missing')
    const dataTransfer = { types: ['text/uri-list'], files: [] }
    expect(fireEvent.dragOver(target, { dataTransfer })).toBe(false)
  })

  it('disables only the sample button and reports progress while busy', () => {
    const { target, onSample } = renderDropzone({ busy: true, progress: 12 })
    if (!target) throw new Error('drop target missing')

    expect(screen.getByRole('button', { name: 'Try sample data' })).toBeDisabled()
    expect(target).not.toHaveAttribute('aria-disabled')
    expect(target).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('Read 12 files so far')).toHaveAttribute('aria-live', 'polite')
    expect(onSample).not.toHaveBeenCalled()
  })

  it('still opens the file picker from the drop target while busy', () => {
    const { input, target } = renderDropzone({ busy: true, progress: null })
    const pick = vi.spyOn(input, 'click')
    if (!target) throw new Error('drop target missing')
    fireEvent.click(target)
    fireEvent.keyDown(target, { key: 'Enter' })
    expect(pick).toHaveBeenCalledTimes(2)
  })

  it('says it is analysing while busy without progress', () => {
    renderDropzone({ busy: true, progress: null })
    expect(screen.getByText('Analysing')).toHaveAttribute('aria-live', 'polite')
  })

  it('says it is analysing when busy with zero files read', () => {
    renderDropzone({ busy: true, progress: 0 })
    expect(screen.getByText('Analysing')).toBeInTheDocument()
  })

  it('uses the singular when one file has been read', () => {
    renderDropzone({ busy: true, progress: 1 })
    expect(screen.getByText('Read 1 file so far')).toBeInTheDocument()
  })

  it('shows an indeterminate bar only while busy', () => {
    const idle = renderDropzone()
    expect(idle.container.querySelector('.dropzone__bar')).toBeNull()
    cleanup()
    const busy = renderDropzone({ busy: true, progress: null })
    expect(busy.container.querySelector('.dropzone__bar')).not.toBeNull()
  })

  it('shows no status when idle', () => {
    renderDropzone()
    expect(screen.queryByText('Analysing')).not.toBeInTheDocument()
    expect(screen.queryByText(/so far/)).not.toBeInTheDocument()
  })

  it('passes on a file chosen while busy, so no file is lost', () => {
    const { input, onFiles } = renderDropzone({ busy: true })
    const files = [fitFile('run.fit')]
    expect(input).not.toBeDisabled()
    fireEvent.change(input, { target: { files } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('compact: shows only the add-more button and no sample or privacy text', async () => {
    const user = userEvent.setup()
    const { input } = renderDropzone({ compact: true })
    const pick = vi.spyOn(input, 'click')

    expect(screen.queryByRole('button', { name: 'Try sample data' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Your files never leave this device/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /drop fit files/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add more files' }))
    expect(pick).toHaveBeenCalledTimes(1)
  })

  it('compact: keeps add-more enabled and shows progress while busy', () => {
    const { input } = renderDropzone({ compact: true, busy: true, progress: 3 })
    const pick = vi.spyOn(input, 'click')
    expect(screen.getByRole('button', { name: 'Add more files' })).toBeEnabled()
    expect(screen.getByText('Read 3 files so far')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add more files' }))
    expect(pick).toHaveBeenCalledTimes(1)
  })
})
