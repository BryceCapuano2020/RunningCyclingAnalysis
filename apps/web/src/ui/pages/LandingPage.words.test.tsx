// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import { noMatchMedia } from '../../test/viewport'
import { wordsOf } from '../../test/wordsOf'
import { LandingPage } from './LandingPage'

afterEach(() => {
  cleanup()
  noMatchMedia()
})

describe('the landing page’s first screens', () => {
  it('stays within its word budget, and its budget of defined terms', () => {
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} onFiles={vi.fn()} />,
    )
    // Measured on a visitor with no files: 447 words and 3 defined terms before D4.10's trim, 403 and 2 after.
    expect(wordsOf(container).length).toBeLessThanOrEqual(403)
    expect(container.querySelectorAll('.definition__term').length).toBeLessThanOrEqual(2)
  })
})
