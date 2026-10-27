import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { APP_WORDS } from '../../appName'
import type { Route } from '../route'
import { hrefFor } from '../route'
import { previousRoute } from '../routeHistory'
import { SPORT_LABEL } from '../sports'
import { ActivitiesIcon, BalanceIcon, BrandMark, PersonIcon, SportIcon } from './icons'
import { useHeaderHeight } from './useHeaderHeight'
import './Header.css'

export interface HeaderProps {
  /** The current page, which the tabs and the Profile link mark as current. */
  route: Route | null
  /** Shows the tabs: only once there is a result to navigate. */
  showTabs?: boolean
  /** The Add files button. */
  addFiles?: ReactNode
  /** The account control. */
  account?: ReactNode
}

interface Tab {
  label: string
  route: Route
  glyph: ReactNode
}

/** Every tab has a glyph, so the four read as one set; on a phone the glyphs are hidden with the names' size. */
const TABS: Tab[] = [
  { label: 'Balance', route: { page: 'balance' }, glyph: <BalanceIcon /> },
  { label: SPORT_LABEL.run, route: { page: 'run' }, glyph: <SportIcon sport="run" /> },
  { label: SPORT_LABEL.ride, route: { page: 'ride' }, glyph: <SportIcon sport="ride" /> },
  { label: 'Activities', route: { page: 'activities' }, glyph: <ActivitiesIcon /> },
]

/**
 * The tab a page belongs to. An activity keeps the tab of the sport it was opened from, and otherwise
 * belongs to Activities; the method page belongs to Balance.
 */
function tabOf(route: Route): Route['page'] | null {
  if (route.page === 'activity') {
    const from = previousRoute()?.page
    return from === 'run' || from === 'ride' ? from : 'activities'
  }
  if (route.page === 'method') return 'balance'
  if (route.page === 'profile') return null
  return route.page
}

/**
 * A tab's aria-current. The tab of the page itself is "page". An activity is a page of its section, so
 * that section's tab is "true" there. Any other page, such as the method page, marks its tab by class
 * only, so a screen reader is not told the tab is the page.
 */
function ariaCurrentOf(
  route: Route | null,
  tab: Tab,
  current: Route['page'] | null,
): 'page' | 'true' | undefined {
  if (route?.page === tab.route.page) return 'page'
  return route?.page === 'activity' && current === tab.route.page ? 'true' : undefined
}

export function Header({ route, showTabs = route !== null, addFiles, account }: HeaderProps) {
  const current = route ? tabOf(route) : null
  const headerRef = useRef<HTMLElement>(null)
  useHeaderHeight(headerRef)
  const [tabs, setTabs] = useState<HTMLElement | null>(null)
  const [tabsOverflow, setTabsOverflow] = useState(false)
  const [tabsFaded, setTabsFaded] = useState(false)
  // Tabs that do not all fit scroll inside their bar, so its labels start at the left. The bar also
  // fades at its edge while there is more to scroll to. The bar is measured again when it scrolls,
  // when its size or its tabs' sizes change, and when the window does.
  useLayoutEffect(() => {
    if (tabs === null) return
    const measure = () => {
      const overflow = tabs.scrollWidth > tabs.clientWidth
      const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1
      setTabsOverflow(overflow)
      setTabsFaded(overflow && !atEnd)
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(tabs)
    Array.from(tabs.children).forEach((tab) => observer?.observe(tab))
    tabs.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      tabs.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [tabs])
  return (
    <header ref={headerRef} className="header">
      <a className="header__brand" href={hrefFor({ page: 'balance' })}>
        <BrandMark />
        <span className="header__name">{APP_WORDS}</span>
      </a>
      <div className="header__actions">
        {addFiles}
        <a
          className="header__profile"
          href={hrefFor({ page: 'profile' })}
          aria-current={route?.page === 'profile' ? 'page' : undefined}
        >
          <PersonIcon />
          <span className="header__profile-label">Profile</span>
        </a>
        <div className="header__account">{account}</div>
      </div>
      {showTabs && (
        <nav
          ref={setTabs}
          className={[
            'header__tabs',
            tabsOverflow && 'header__tabs--overflowing',
            tabsFaded && 'header__tabs--faded',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Sections"
        >
          {TABS.map((tab) => (
            <a
              key={tab.label}
              className={
                current === tab.route.page ? 'header__tab header__tab--current' : 'header__tab'
              }
              href={hrefFor(tab.route)}
              aria-current={ariaCurrentOf(route, tab, current)}
            >
              {tab.glyph}
              {tab.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
