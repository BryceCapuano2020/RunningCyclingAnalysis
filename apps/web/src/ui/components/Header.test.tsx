// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NARROW_PHONE_MAX_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  RAIL_MIN_WIDTH_PX,
  SMALL_PHONE_MAX_WIDTH_PX,
} from '../layoutBreakpoints'
import { GoogleSignInButton } from './GoogleSignInButton'
import { Header } from './Header'
import { readStylesheet } from '../test/stylesheet'

const headerCss = await readStylesheet(import.meta.url, './Header.css')
const tokensCss = await readStylesheet(import.meta.url, '../../styles/tokens.css')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Whether the second element comes later in the page than the first. */
function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('Header stylesheet', () => {
  it('takes its breakpoints from layoutBreakpoints.ts, the one place they are named', () => {
    for (const width of [PHONE_MAX_WIDTH_PX, NARROW_PHONE_MAX_WIDTH_PX, SMALL_PHONE_MAX_WIDTH_PX]) {
      expect(headerCss).toContain(`@media (max-width: ${width}px)`)
    }
    expect(headerCss).toContain(`@media (min-width: ${RAIL_MIN_WIDTH_PX}px)`)
  })

  it('stays at the top of the screen only from the rail’s width, and scrolls away below it', () => {
    const wide = headerCss.slice(headerCss.indexOf(`@media (min-width: ${RAIL_MIN_WIDTH_PX}px)`))
    expect(wide).toMatch(/\.header \{[^}]*position:\s*sticky;[^}]*top:\s*0/)
    expect(headerCss.slice(0, headerCss.indexOf('@media'))).not.toMatch(/position:\s*sticky/)
  })

  it('keeps sign-in one tap away as the mark and a visible "Sign in"', () => {
    expect(headerCss).not.toMatch(/google-sign-in \{\s*display:\s*none/)
    expect(headerCss).toMatch(/\.header__account \.google-sign-in \{[^}]*white-space:\s*nowrap/)
  })

  it('makes a phone control 44 px tall, and every other control 40 px', () => {
    expect(tokensCss).toMatch(/--control-height:\s*40px;/)
    expect(tokensCss).toMatch(
      new RegExp(
        `@media \\(max-width: ${PHONE_MAX_WIDTH_PX}px\\), \\(pointer: coarse\\) \\{\\s*:root \\{\\s*--control-height:\\s*44px;\\s*--button-height:\\s*44px`,
      ),
    )
  })

  it('keeps a control the browser scrolls to clear of the header and of any bar stuck under it', () => {
    expect(headerCss).not.toMatch(/--header-height:/)
    expect(headerCss).toMatch(
      /html \{[^}]*scroll-padding-top:\s*calc\(var\(--header-height\) \+ var\(--sticky-extra\)\)/,
    )
    expect(tokensCss).toMatch(/--sticky-extra:\s*0px;/)
  })

  it('starts --header-height at one row where the header sticks and at zero where it scrolls away', () => {
    expect(tokensCss).toMatch(
      /--header-height:\s*calc\(var\(--control-height\) \+ var\(--space-3\) \* 2 \+ 1px\);/,
    )
    expect(tokensCss).toMatch(
      new RegExp(
        `@media \\(max-width: ${RAIL_MIN_WIDTH_PX - 1}px\\) \\{\\s*:root \\{\\s*--header-height:\\s*0px;`,
      ),
    )
  })

  it('keeps the words of Add files at every width, and sets the wordmark a step smaller at 360 px to fit them', () => {
    expect(headerCss).not.toMatch(/add-files__label|clip-path/)
    expect(headerCss).toMatch(
      new RegExp(
        `@media \\(max-width: ${SMALL_PHONE_MAX_WIDTH_PX}px\\) \\{[^@]*\\.header__brand \\{\\s*font-size:\\s*var\\(--text-md\\)`,
      ),
    )
  })
})

describe('Header', () => {
  it('links the wordmark home, in words, with no tile', () => {
    render(<Header route={null} />)
    const brand = screen.getByRole('link', { name: 'Running Cycling Analysis' })
    expect(brand).toHaveAttribute('href', '#/')
    expect(brand.querySelector('svg')).toBeNull()
  })

  it('hides History and Activities while there is nothing to navigate', () => {
    render(<Header route={null} />)
    expect(screen.queryByRole('navigation', { name: 'More pages' })).not.toBeInTheDocument()
  })

  it('links History, Activities and Method as text, and marks the current one', () => {
    render(<Header route={{ page: 'history' }} />)
    const links = within(screen.getByRole('navigation', { name: 'More pages' })).getAllByRole(
      'link',
    )
    expect(links.map((link) => link.textContent)).toEqual(['History', 'Activities', 'Method'])
    expect(screen.getByRole('link', { name: 'Method' })).toHaveAttribute('href', '#/method')
    expect(screen.getByRole('link', { name: 'Method' })).toHaveClass('header__link--method')
    for (const link of links) expect(link.querySelector('svg')).toBeNull()
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'History' })).toHaveClass('header__link--current')
    expect(screen.getByRole('link', { name: 'Activities' })).not.toHaveAttribute('aria-current')
  })

  it('leaves Balance, Run and Ride to the rail', () => {
    render(<Header route={{ page: 'run' }} />)
    for (const name of ['Balance', 'Run', 'Ride'])
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
  })

  describe('an activity', () => {
    afterEach(() => window.history.replaceState(null, '', '#/'))

    it('keeps Activities current, marked "true", when it was opened from the list', () => {
      window.history.replaceState({ rcaFrom: '#/activities' }, '', '#/activities/a1')
      render(<Header route={{ page: 'activity', id: 'a1' }} />)
      const activities = screen.getByRole('link', { name: 'Activities' })
      expect(activities).toHaveClass('header__link--current')
      expect(activities).toHaveAttribute('aria-current', 'true')
    })

    it('leaves Activities plain when it was opened from a sport, whose rail link is lit', () => {
      window.history.replaceState({ rcaFrom: '#/run' }, '', '#/activities/a1')
      render(<Header route={{ page: 'activity', id: 'a1' }} />)
      const activities = screen.getByRole('link', { name: 'Activities' })
      expect(activities).not.toHaveClass('header__link--current')
      expect(activities).not.toHaveAttribute('aria-current')
    })
  })

  it('always links to the profile as text, marked current there', () => {
    const { rerender } = render(<Header route={null} />)
    const profile = screen.getByRole('link', { name: 'Profile' })
    expect(profile).toHaveAttribute('href', '#/profile')
    expect(profile).toHaveTextContent(/^Profile$/)
    expect(profile.querySelector('svg')).toBeNull()
    rerender(<Header route={{ page: 'profile' }} />)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
  })

  it('names the sign-in button for screen readers, so it is found by role and name', () => {
    render(<Header route={null} account={<GoogleSignInButton onClick={() => undefined} />} />)
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('reads in order: the brand, the page links, then Profile, the account and Add files', () => {
    render(
      <Header
        route={{ page: 'run' }}
        addFiles={<button type="button">Add files</button>}
        account={<button type="button">Sign in</button>}
      />,
    )
    const brand = screen.getByRole('link', { name: 'Running Cycling Analysis' })
    const pages = screen.getByRole('navigation', { name: 'More pages' })
    const profile = screen.getByRole('link', { name: 'Profile' })
    const account = screen.getByRole('button', { name: 'Sign in' })
    const addFiles = screen.getByRole('button', { name: 'Add files' })
    expect(follows(brand, pages)).toBe(true)
    expect(follows(pages, profile)).toBe(true)
    expect(follows(profile, account)).toBe(true)
    expect(follows(account, addFiles)).toBe(true)
  })
})

describe('Header height', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.style.removeProperty('--header-height')
  })

  /** A ResizeObserver that the test fires by hand. */
  function fakeObservers() {
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
    return observers
  }

  it('sets --header-height to the header as measured while it sticks, and keeps it so as it resizes', () => {
    const observers = fakeObservers()
    const computed = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
      element.tagName === 'HEADER'
        ? ({ position: 'sticky' } as CSSStyleDeclaration)
        : computed(element),
    )
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(65)
    render(<Header route={{ page: 'run' }} />)
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('65px')
    height.mockReturnValue(97)
    const header = document.querySelector('header')
    observers.find((observer) => observer.observed.includes(header as Element))?.fire()
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('97px')
  })

  it('sets --header-height to zero while the header scrolls away with the page', () => {
    fakeObservers()
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(97)
    render(<Header route={{ page: 'run' }} />)
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('0px')
  })
})
