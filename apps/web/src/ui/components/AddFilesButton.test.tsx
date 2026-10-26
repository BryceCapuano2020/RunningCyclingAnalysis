// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddFilesButton } from './AddFilesButton'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'matchMedia')
})

/** Stubs the narrow phone's width query, which is what hides the words on a phone. */
function setNarrow(narrow: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: narrow && query === '(max-width: 420px)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

function fitFile(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

function renderAddFiles() {
  const onFiles = vi.fn()
  const view = render(<AddFilesButton onFiles={onFiles} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input missing')
  return { input, onFiles, button: screen.getByRole('button', { name: 'Add files' }) }
}

describe('AddFilesButton', () => {
  it('is the primary header button, and is never disabled', () => {
    const { button, input } = renderAddFiles()
    expect(button).toHaveClass('btn', 'btn-primary')
    expect(button).toBeEnabled()
    expect(input).not.toBeDisabled()
  })

  it('has no title on a wide screen, where its words show', () => {
    setNarrow(false)
    const { button } = renderAddFiles()
    expect(button).not.toHaveAttribute('title')
  })

  it('titles the button on a narrow phone, where only the plus shows, so it still says what it does', () => {
    setNarrow(true)
    const { button } = renderAddFiles()
    expect(button).toHaveAttribute('title', 'Add files')
  })

  it('opens the file chooser on click', async () => {
    const user = userEvent.setup()
    const { button, input } = renderAddFiles()
    const pick = vi.spyOn(input, 'click')
    await user.click(button)
    expect(pick).toHaveBeenCalledTimes(1)
  })

  it('passes the files chosen in the chooser to onFiles', () => {
    const { input, onFiles } = renderAddFiles()
    const files = [fitFile('run.fit')]
    fireEvent.change(input, { target: { files } })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith(files)
  })
})
