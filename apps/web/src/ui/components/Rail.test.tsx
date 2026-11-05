// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RAIL_MIN_WIDTH_PX } from '../layoutBreakpoints'
import { Rail, Shell } from './Rail'
import { readStylesheet } from './stylesheet'

const railCss = await readStylesheet(import.meta.url, './Rail.css')

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '#/')
})

describe('Rail', () => {
  it('links Balance, Run and Ride as text in the Sections navigation, and marks the current one', () => {
    render(<Rail route={{ page: 'ride' }} />)
    const links = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Balance', 'Run', 'Ride'])
    for (const link of links) expect(link.querySelector('svg')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ride' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Ride' })).toHaveClass('rail__link--current')
    expect(screen.getByRole('link', { name: 'Run' })).not.toHaveAttribute('aria-current')
  })

  it('lights Balance on the method page, but names it no current page', () => {
    render(<Rail route={{ page: 'method' }} />)
    const balance = screen.getByRole('link', { name: 'Balance' })
    expect(balance).toHaveClass('rail__link--current')
    expect(balance).not.toHaveAttribute('aria-current')
  })

  it('keeps a sport lit, marked "true", on an activity opened from it', () => {
    window.history.replaceState({ rcaFrom: '#/run' }, '', '#/activities/a1')
    render(<Rail route={{ page: 'activity', id: 'a1' }} />)
    expect(screen.getByRole('link', { name: 'Run' })).toHaveClass('rail__link--current')
    expect(screen.getByRole('link', { name: 'Run' })).toHaveAttribute('aria-current', 'true')
  })

  it('sets the periods after the pages, and none where it is given none', () => {
    const { container, rerender } = render(
      <Rail route={{ page: 'run' }} periods={<p>Periods here</p>} />,
    )
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const periods = screen.getByText('Periods here')
    expect(nav.compareDocumentPosition(periods) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    rerender(<Rail route={{ page: 'history' }} />)
    expect(container.querySelector('.rail__periods')).toBeNull()
  })

  it('stands beside the page in the shell, the rail first', () => {
    render(
      <Shell route={{ page: 'balance' }}>
        <h1>Page</h1>
      </Shell>,
    )
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const page = screen.getByRole('heading', { name: 'Page' })
    expect(page.closest('.shell__page')).not.toBeNull()
    expect(nav.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Rail stylesheet', () => {
  const wide = railCss.slice(railCss.indexOf(`@media (min-width: ${RAIL_MIN_WIDTH_PX}px)`))

  it('is a column of the rail’s width beside the page from RAIL_MIN_WIDTH_PX, held in view', () => {
    expect(wide).toMatch(
      /\.shell \{[^}]*grid-template-columns:\s*var\(--rail-width\) minmax\(0, 1fr\)/,
    )
    expect(wide).toMatch(/\.rail \{[^}]*position:\s*sticky/)
  })

  it('is one row below it that scrolls inside itself, so the page never scrolls sideways', () => {
    const narrow = railCss.slice(0, railCss.indexOf('@media'))
    expect(narrow).toMatch(/\.rail \{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto/)
  })

  it('marks the current page and period by ink alone, never a box, bar or icon', () => {
    expect(railCss).toMatch(
      /\.rail__link--current,\s*\.rail__link\[aria-current='page'\] \{\s*color:\s*var\(--ink\)/,
    )
    expect(railCss).toMatch(/\.rail__link \{[^}]*color:\s*var\(--ink-secondary\)/)
    expect(railCss).not.toMatch(/background|box-shadow|border-radius/)
  })

  it('sets a rule between the pages and the periods', () => {
    expect(railCss).toMatch(/\.rail__periods \{[^}]*border-left:\s*1px solid var\(--rule\)/)
    expect(wide).toMatch(/\.rail__periods \{[^}]*border-top:\s*1px solid var\(--rule\)/)
  })
})
