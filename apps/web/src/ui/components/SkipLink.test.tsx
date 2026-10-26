// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { PAGE_HEADING_ID } from '../pages/pageHeading'
import { SkipLink } from './SkipLink'

afterEach(() => {
  cleanup()
})

describe('SkipLink', () => {
  it('moves focus to the page heading, past the header, without changing the address', async () => {
    window.location.hash = '#/run'
    render(
      <>
        <SkipLink />
        <header>
          <button type="button">Add files</button>
        </header>
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Run
        </h1>
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Skip to content' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Run' })).toHaveFocus()
    expect(window.location.hash).toBe('#/run')
  })
})
