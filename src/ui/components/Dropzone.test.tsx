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

  it('shows a different look while a file is dragged over it', () => {
    const { container, target } = renderDropzone()
    const zone = container.querySelector('.dropzone')
    if (!target || !zone) throw new Error('drop zone missing')

    expect(zone).not.toHaveClass('dropzone--over')
    fireEvent.dragEnter(target)
    expect(zone).toHaveClass('dropzone--over')
    fireEvent.dragLeave(target)
    expect(zone).not.toHaveClass('dropzone--over')
  })

  it('disables the controls and reports progress while busy', () => {
    const { target, onFiles, onSample, input } = renderDropzone({
      busy: true,
      progress: 12,
    })
    if (!target) throw new Error('drop target missing')

    expect(screen.getByRole('button', { name: 'Try sample data' })).toBeDisabled()
    expect(input).toBeDisabled()
    expect(target).toHaveAttribute('aria-disabled', 'true')
    expect(target).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('Read 12 files so far')).toHaveAttribute('aria-live', 'polite')

    fireEvent.drop(target, { dataTransfer: { files: [fitFile('run.fit')] } })
    expect(onFiles).not.toHaveBeenCalled()
    expect(onSample).not.toHaveBeenCalled()
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

  it('ignores a file selection while busy', () => {
    const { input, onFiles } = renderDropzone({ busy: true })
    fireEvent.change(input, { target: { files: [fitFile('run.fit')] } })
    expect(onFiles).not.toHaveBeenCalled()
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

  it('compact: disables add-more and shows progress while busy', () => {
    renderDropzone({ compact: true, busy: true, progress: 3 })
    expect(screen.getByRole('button', { name: 'Add more files' })).toBeDisabled()
    expect(screen.getByText('Read 3 files so far')).toBeInTheDocument()
  })
})
