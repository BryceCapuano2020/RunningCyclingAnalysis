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
    expect(heading.parentElement?.className).not.toContain('page-heading')
  })

  it('holds a page action on the heading’s line, after it', () => {
    const { container } = render(
      <PageHeading action={<button type="button">Share image</button>}>Balance</PageHeading>,
    )
    const line = container.querySelector('.page-heading')!
    expect(line.firstElementChild).toBe(screen.getByRole('heading', { level: 1 }))
    expect(line.lastElementChild).toBe(screen.getByRole('button', { name: 'Share image' }))
  })
})
