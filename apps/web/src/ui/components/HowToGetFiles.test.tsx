// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { HowToGetFilesButton } from './HowToGetFiles'

afterEach(() => {
  cleanup()
})

function openGuides() {
  fireEvent.click(screen.getByRole('button', { name: 'How to get your files' }))
  return screen.getByRole('dialog', { name: 'How to get your files' })
}

describe('HowToGetFilesButton', () => {
  it('opens the export guides in a dialog from any page', () => {
    render(<HowToGetFilesButton />)
    expect(screen.queryByRole('dialog')).toBeNull()

    const dialog = openGuides()
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('button', { name: 'Strava' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Zwift' })).toBeInTheDocument()
  })

  it('puts focus on Close when it opens, so the guides are read from the top', () => {
    render(<HowToGetFilesButton />)
    openGuides()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('closes with Close, and returns focus to the button that opened it', async () => {
    const user = userEvent.setup()
    render(<HowToGetFilesButton />)
    const opener = screen.getByRole('button', { name: 'How to get your files' })
    fireEvent.click(opener)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open')
    expect(opener).toHaveFocus()
  })

  it('closes on Escape, returns focus to the button that opened it, and keeps the route', () => {
    render(<HowToGetFilesButton />)
    const hash = window.location.hash
    const opener = screen.getByRole('button', { name: 'How to get your files' })
    const dialog = openGuides()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open')
    expect(opener).toHaveFocus()
    expect(window.location.hash).toBe(hash)
  })
})
