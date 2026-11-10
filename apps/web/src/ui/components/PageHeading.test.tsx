// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PageHeading } from './PageHeading'

afterEach(cleanup)

describe('PageHeading', () => {
  it('is the page’s one h1, with the id the app moves focus to', () => {
    render(<PageHeading>Run</PageHeading>)
    const heading = screen.getByRole('heading', { level: 1, name: 'Run' })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })
})
