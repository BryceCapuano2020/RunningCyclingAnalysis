// @vitest-environment jsdom
import { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleSignInButton } from './GoogleSignInButton'

afterEach(() => {
  cleanup()
})

describe('GoogleSignInButton', () => {
  it('is a labelled button that reports clicks', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<GoogleSignInButton onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Sign in with Google' })
    expect(button).toHaveAttribute('type', 'button')
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('passes the element to buttonRef so a parent can focus it', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<GoogleSignInButton onClick={vi.fn()} buttonRef={ref} />)
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Sign in with Google' }))
  })

  it('draws the Google mark with its exact paths and brand colours, hidden from assistive technology', () => {
    const { container } = render(<GoogleSignInButton onClick={vi.fn()} />)
    const mark = container.querySelector('svg')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
    expect(mark).toHaveAttribute('viewBox', '0 0 18 18')
    const paths = Array.from(mark?.querySelectorAll('path') ?? [])
    expect(paths.map((path) => path.getAttribute('fill'))).toEqual([
      '#4285F4',
      '#34A853',
      '#FBBC05',
      '#EA4335',
    ])
    expect(paths.map((path) => path.getAttribute('d'))).toEqual([
      'M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z',
      'M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z',
      'M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z',
      'M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z',
    ])
  })
})
