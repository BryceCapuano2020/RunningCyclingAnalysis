// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFilePicker } from './useFilePicker'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Picker({ onFiles }: { onFiles: (files: File[]) => void }) {
  const picker = useFilePicker(onFiles)
  return (
    <>
      <button type="button" onClick={picker.open}>
        Choose
      </button>
      {picker.input}
    </>
  )
}

function renderPicker() {
  const onFiles = vi.fn()
  const view = render(<Picker onFiles={onFiles} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input missing')
  return { input, onFiles }
}

function fitFile(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

describe('useFilePicker', () => {
  it('opens the file chooser when the control calls open', () => {
    const { input } = renderPicker()
    const pick = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    expect(pick).toHaveBeenCalledTimes(1)
  })

  it('lets the chooser pick several FIT, GPX, TCX, gzip and zip files', () => {
    const { input } = renderPicker()
    expect(input).toHaveAttribute('multiple')
    expect(input).toHaveAttribute('accept', '.fit,.gpx,.tcx,.gz,.zip')
    expect(input).toHaveAttribute('hidden')
  })

  it('passes the chosen files to onFiles', () => {
    const { input, onFiles } = renderPicker()
    const files = [fitFile('ride.fit'), fitFile('export.zip')]
    fireEvent.change(input, { target: { files } })
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('does nothing when the chooser closes with no files', () => {
    const { input, onFiles } = renderPicker()
    fireEvent.change(input, { target: { files: [] } })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('clears the input after a change, so the same file can be chosen again', () => {
    const setValue = vi.spyOn(HTMLInputElement.prototype, 'value', 'set')
    const { input, onFiles } = renderPicker()
    fireEvent.change(input, { target: { files: [fitFile('ride.fit')] } })
    expect(setValue).toHaveBeenCalledWith('')
    expect(onFiles).toHaveBeenCalledTimes(1)
  })

  it('still passes the files when the page holding the input is replaced before the change lands', () => {
    const { input, onFiles } = renderPicker()
    cleanup()
    expect(input.isConnected).toBe(false)
    const files = [fitFile('ride.fit')]
    // A real chooser sets the files, then fires the change at the input wherever it is.
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    input.dispatchEvent(new Event('change'))
    expect(onFiles).toHaveBeenCalledWith(files)
  })

  it('calls the latest onFiles, and once per change', () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<Picker onFiles={first} />)
    view.rerender(<Picker onFiles={second} />)
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    fireEvent.change(input, { target: { files: [fitFile('ride.fit')] } })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
