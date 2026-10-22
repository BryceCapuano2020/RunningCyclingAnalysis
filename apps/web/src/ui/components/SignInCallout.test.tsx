// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInCallout } from './SignInCallout'

afterEach(() => {
  cleanup()
})

describe('SignInCallout', () => {
  it('names the benefit in a labelled section', () => {
    render(<SignInCallout onSignIn={vi.fn()} />)
    expect(
      screen.getByRole('region', { name: 'Save your activities and see them on any device' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Save your activities and see them on any device' }),
    ).toBeInTheDocument()
  })

  it('explains where analysis runs and how files are stored', () => {
    render(<SignInCallout onSignIn={vi.fn()} />)
    expect(
      screen.getByText(
        'Sign in with Google to keep your library. Analysis still runs in your browser; activity summaries are saved to your private account, original files too if you choose, and you can delete everything at any time.',
      ),
    ).toBeInTheDocument()
  })

  it('offers the Google button, which starts sign-in', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    render(<SignInCallout onSignIn={onSignIn} />)
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
})
