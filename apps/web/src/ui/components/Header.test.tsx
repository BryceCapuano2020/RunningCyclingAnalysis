// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COMPACT_PHONE_MAX_WIDTH_PX,
  NARROW_PHONE_MAX_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  SMALL_PHONE_MAX_WIDTH_PX,
  WORDMARK_HIDDEN_MAX_WIDTH_PX,
} from '../layoutBreakpoints'
import { GoogleSignInButton } from './GoogleSignInButton'
import { Header } from './Header'
import { readStylesheet } from './stylesheet'

const headerCss = await readStylesheet(import.meta.url, './Header.css')
const tokensCss = await readStylesheet(import.meta.url, '../../styles/tokens.css')
const designMd = await readStylesheet(import.meta.url, '../../../../../docs/DESIGN.md')

/** The media block of a stylesheet at a given width, from its opening rule to its closing brace. */
function mediaBlock(css: string, maxWidth: number): string {
  const open = css.indexOf(`@media (max-width: ${maxWidth}px) {`)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open, i + 1)
    }
  }
  return ''
}

const phoneBlock = (css: string) => mediaBlock(css, PHONE_MAX_WIDTH_PX)

/**
 * The width of "Activities" in Chromium at 100% text, per pixel of its font size: 57.73 px at 14 px,
 * with the bundled Barlow Condensed and 0.02em letter-spacing. jsdom cannot lay text out, so the fit
 * is checked against this measured ratio; the browser run is the real check.
 */
const ACTIVITIES_PER_FONT_PX = 57.73 / 14

/** A space token's value in px, read from tokens.css. */
function spacePx(css: string, token: string): number {
  return Number(new RegExp(`--${token}:\\s*(\\d+)px`).exec(css)?.[1])
}
const smallPhoneBlock = (css: string) => mediaBlock(css, SMALL_PHONE_MAX_WIDTH_PX)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A 320 px tab bar whose tabs need the given width, so it overflows when that is wider. */
function overflowingBar(scrollWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
}

/** Whether the second element comes later in the page than the first. */
function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('Header on a phone', () => {
  it('keeps the brand and the actions on one row at every phone width, not three', () => {
    expect(phoneBlock(headerCss)).toMatch(/grid-template-areas:\s*'brand actions';/)
  })

  it('keeps the tabs in a bar fixed to the foot of the screen, so they are in reach as the page scrolls', () => {
    expect(phoneBlock(headerCss)).toMatch(
      /\.header__tabs \{[^}]*position:\s*fixed;[^}]*bottom:\s*0/,
    )
  })

  it('keeps the header at the top of the screen as the page scrolls', () => {
    expect(headerCss).toMatch(/\.header \{[^}]*position:\s*sticky;[^}]*top:\s*0/)
  })

  it('keeps sign-in one tap away as a compact G, with its name kept for screen readers', () => {
    const phone = phoneBlock(headerCss)
    expect(phone).not.toMatch(/google-sign-in \{\s*display:\s*none/)
    expect(phone).toMatch(
      /\.header__account \.google-sign-in \{[^}]*width:\s*var\(--control-height\)/,
    )
    expect(phone).toMatch(/\.header__account \.google-sign-in__label \{[^}]*position:\s*absolute/)
  })

  it('names the compact sign-in button for screen readers, so it is found by role and name', () => {
    render(<Header route={null} account={<GoogleSignInButton onClick={() => undefined} />} />)
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('makes a phone control 44 px tall, and every other control 40 px', () => {
    expect(tokensCss).toMatch(/--control-height:\s*40px;/)
    expect(tokensCss).toMatch(
      new RegExp(
        `@media \\(max-width: ${PHONE_MAX_WIDTH_PX}px\\), \\(pointer: coarse\\) \\{\\s*:root \\{\\s*--control-height:\\s*44px`,
      ),
    )
  })

  it('keeps the header height and the tab bar height in the tokens, with the header clear of focus', () => {
    expect(tokensCss).toContain(
      '--header-height: calc(var(--space-5) + var(--control-height) * 2 + var(--space-2) + 1px);',
    )
    expect(tokensCss).toMatch(/--tab-bar-height:\s*48px;/)
    expect(mediaBlock(tokensCss, PHONE_MAX_WIDTH_PX)).toContain(
      '--header-height: calc(var(--space-5) + var(--control-height) + var(--space-2) + 1px);',
    )
    expect(headerCss).not.toMatch(/--header-height:/)
    expect(headerCss).toMatch(/html \{[^}]*scroll-padding-top:\s*var\(--header-height\)/)
  })

  it('tells the reader the header sizes are in tokens.css, where they are', () => {
    expect(designMd).toMatch(/header's sizes are custom properties in `tokens\.css`/)
    expect(designMd).not.toMatch(/header's sizes are custom properties in `Header\.css`/)
  })

  it('pads the bottom of the scroll by the tab bar and its top border, so focus clears the bar', () => {
    expect(phoneBlock(headerCss)).toContain(
      'scroll-padding-bottom: calc(var(--tab-bar-height) + 1px);',
    )
  })
  it('sets the four tabs as equal slots that may shrink, with labels at the phone size', () => {
    const tab = /\.header__tab \{([^}]*)\}/.exec(phoneBlock(headerCss))?.[1] ?? ''
    expect(tab).toMatch(/flex:\s*1 1 0/)
    expect(tab).toMatch(/min-width:\s*0/)
    expect(tab).toMatch(/font-size:\s*var\(--text-label\)/)
  })

  it('fits Activities, the longest label, in its tab slot at 320 px with the small label size, and at 361 px with the phone size, at 100% text', () => {
    // Four equal tabs share the bar less the gaps between them; each tab keeps its padding either side.
    const gap = spacePx(tokensCss, 'space-1')
    const padding = spacePx(tokensCss, 'space-1')
    const slot = (bar: number) => (bar - 3 * gap) / 4 - 2 * padding
    // A size is a literal in a block, or the phone label token, which tokens.css holds.
    const fontPx = (block: string) => {
      const literal = /\.header__tab \{[^}]*font-size:\s*([\d.]+)rem/.exec(block)?.[1]
      const token = /--text-label:\s*([\d.]+)rem/.exec(tokensCss)?.[1]
      return Number(literal ?? token) * 16
    }
    const narrowest = 320
    const smallFont = fontPx(smallPhoneBlock(headerCss))
    const phoneFont = fontPx(phoneBlock(headerCss))
    expect(ACTIVITIES_PER_FONT_PX * smallFont).toBeLessThanOrEqual(slot(narrowest))
    expect(ACTIVITIES_PER_FONT_PX * phoneFont).toBeLessThanOrEqual(
      slot(SMALL_PHONE_MAX_WIDTH_PX + 1),
    )
  })

  it('starts the tabs at the left when the bar overflows, so no label spills off the left edge', () => {
    expect(phoneBlock(headerCss)).toMatch(
      /\.header__tabs--overflowing \.header__tab \{[^}]*justify-content:\s*flex-start/,
    )
  })

  it('fades the tab bar edge while there is more to scroll to, so the rest of the row can be found', () => {
    expect(phoneBlock(headerCss)).toMatch(/\.header__tabs--faded \{[^}]*mask-image/)
    expect(phoneBlock(headerCss)).not.toMatch(/\.header__tabs--overflowing \{[^}]*mask-image/)
  })

  it('takes its breakpoints from layoutBreakpoints.ts, the one place they are named', () => {
    expect(tokensCss).toContain(`@media (max-width: ${PHONE_MAX_WIDTH_PX}px)`)
    expect(headerCss).toContain(`@media (max-width: ${PHONE_MAX_WIDTH_PX}px)`)
    expect(headerCss).toContain(`@media (max-width: ${COMPACT_PHONE_MAX_WIDTH_PX}px)`)
    expect(headerCss).toContain(`@media (max-width: ${NARROW_PHONE_MAX_WIDTH_PX}px)`)
    expect(headerCss).toContain(`@media (max-width: ${SMALL_PHONE_MAX_WIDTH_PX}px)`)
    expect(headerCss).toContain(`@media (max-width: ${WORDMARK_HIDDEN_MAX_WIDTH_PX}px)`)
  })

  it('drops only the fade once the bar is scrolled to its end: the labels stay left-aligned', () => {
    overflowingBar(480)
    let scrolled = 0
    vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(() => scrolled)
    render(<Header route={{ page: 'run' }} />)
    const bar = screen.getByRole('navigation', { name: 'Sections' })
    expect(bar).toHaveClass('header__tabs--overflowing', 'header__tabs--faded')

    scrolled = 160
    fireEvent.scroll(bar)
    expect(bar).toHaveClass('header__tabs--overflowing')
    expect(bar).not.toHaveClass('header__tabs--faded')

    scrolled = 0
    fireEvent.scroll(bar)
    expect(bar).toHaveClass('header__tabs--overflowing', 'header__tabs--faded')
  })

  it('shows the fade on a tab bar whose tabs overflow, and neither class on one that fits', () => {
    overflowingBar(480)
    const { unmount } = render(<Header route={{ page: 'run' }} />)
    expect(screen.getByRole('navigation', { name: 'Sections' })).toHaveClass(
      'header__tabs--overflowing',
      'header__tabs--faded',
    )
    unmount()

    overflowingBar(320)
    render(<Header route={{ page: 'run' }} />)
    const bar = screen.getByRole('navigation', { name: 'Sections' })
    expect(bar).not.toHaveClass('header__tabs--overflowing')
    expect(bar).not.toHaveClass('header__tabs--faded')
  })
})

describe('Header profile link', () => {
  it('keeps its word visible at every width, so the link is not an unlabeled icon on a phone', () => {
    render(<Header route={null} />)

    const link = screen.getByRole('link', { name: 'Profile' })
    expect(link).toHaveTextContent('Profile')
    expect(link.querySelector('.header__profile-label')).toHaveTextContent('Profile')
    // The phone rule hides the wordmark. It must not hide the Profile word.
    expect(headerCss).not.toMatch(/\.header__profile-label\s*[,{]/)
  })
})

describe('Header', () => {
  it('links the wordmark home', () => {
    render(<Header route={null} />)
    expect(screen.getByRole('link', { name: 'Running Cycling Analysis' })).toHaveAttribute(
      'href',
      '#/',
    )
  })

  it('hides the tabs while there is nothing to navigate', () => {
    render(<Header route={null} />)
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
  })

  it('shows the four tabs and marks the current one', () => {
    render(<Header route={{ page: 'ride' }} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Balance', 'Run', 'Ride', 'Activities'])
    expect(screen.getByRole('link', { name: 'Ride' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Run' })).not.toHaveAttribute('aria-current')
  })

  it('marks Activities current on an activity page and Balance on the method page', () => {
    const { rerender } = render(<Header route={{ page: 'activity', id: 'a1' }} />)
    expect(screen.getByRole('link', { name: 'Activities' })).toHaveAttribute('aria-current', 'page')
    rerender(<Header route={{ page: 'method' }} />)
    expect(screen.getByRole('link', { name: 'Balance' })).toHaveAttribute('aria-current', 'page')
  })

  describe('an activity opened from a sport', () => {
    afterEach(() => window.history.replaceState(null, '', '#/'))

    it('keeps that sport’s tab lit, since the visitor came from it', () => {
      window.history.replaceState({ rcaFrom: '#/run' }, '', '#/activities/a1')
      render(<Header route={{ page: 'activity', id: 'a1' }} />)
      expect(screen.getByRole('link', { name: 'Run' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Activities' })).not.toHaveAttribute('aria-current')
    })

    it('keeps Activities lit when it was opened from the list', () => {
      window.history.replaceState({ rcaFrom: '#/activities' }, '', '#/activities/a1')
      render(<Header route={{ page: 'activity', id: 'a1' }} />)
      expect(screen.getByRole('link', { name: 'Activities' })).toHaveAttribute(
        'aria-current',
        'page',
      )
    })
  })

  it('always links to the profile, marked current there', () => {
    const { rerender } = render(<Header route={null} />)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
    rerender(<Header route={{ page: 'profile' }} />)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
  })

  it('renders the add-files and account controls it is given', () => {
    render(
      <Header
        route={null}
        addFiles={<button type="button">Add files</button>}
        account={<button type="button">Sign in</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('reads in order: the brand, then the actions, then the section tabs', () => {
    render(
      <Header
        route={{ page: 'run' }}
        addFiles={<button type="button">Add files</button>}
        account={<button type="button">Sign in</button>}
      />,
    )
    const brand = screen.getByRole('link', { name: 'Running Cycling Analysis' })
    const addFiles = screen.getByRole('button', { name: 'Add files' })
    const profile = screen.getByRole('link', { name: 'Profile' })
    const tabs = screen.getByRole('navigation', { name: 'Sections' })
    expect(follows(brand, addFiles)).toBe(true)
    expect(follows(addFiles, profile)).toBe(true)
    expect(follows(profile, tabs)).toBe(true)
  })
})

describe('Header glyphs and wordmark', () => {
  it('gives every tab a glyph, so the four tabs read as one set', () => {
    render(<Header route={{ page: 'balance' }} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link')
    expect(tabs).toHaveLength(4)
    for (const tab of tabs) expect(tab.querySelector('svg')).not.toBeNull()
  })

  it('spells the wordmark in words, so it does not read as a file name', () => {
    render(<Header route={{ page: 'balance' }} />)
    expect(screen.getByRole('link', { name: 'Running Cycling Analysis' })).toBeInTheDocument()
  })
})

describe('Header height', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.style.removeProperty('--header-height')
  })

  it('sets --header-height to the header as measured, and keeps it so as the header resizes', () => {
    // The tab bar has an observer too, so the one watching the header is found by its target.
    const observers: { observed: Element[]; fire: () => void }[] = []
    class FakeResizeObserver {
      observed: Element[] = []
      constructor(callback: ResizeObserverCallback) {
        observers.push({
          observed: this.observed,
          fire: () => callback([], this as unknown as ResizeObserver),
        })
      }
      observe(element: Element) {
        this.observed.push(element)
      }
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(161)

    render(<Header route={{ page: 'run' }} />)
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('161px')

    height.mockReturnValue(113)
    const header = document.querySelector('header')
    observers.find((observer) => observer.observed.includes(header as Element))?.fire()
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('113px')
  })
})
