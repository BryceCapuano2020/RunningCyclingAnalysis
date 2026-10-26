import { useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { APP_WORDS } from '../../appName'
import type { Route } from '../route'
import { hrefFor } from '../route'
import { SPORT_LABEL } from '../sports'
import { ActivitiesIcon, BalanceIcon, BrandMark, PersonIcon, SportIcon } from './icons'
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

/** The tab a page belongs to. An activity belongs to Activities; the method page to Balance. */
function tabOf(route: Route): Route['page'] | null {
  if (route.page === 'activity') return 'activities'
  if (route.page === 'method') return 'balance'
  if (route.page === 'profile') return null
  return route.page
}

export function Header({ route, showTabs = route !== null, addFiles, account }: HeaderProps) {
  const current = route ? tabOf(route) : null
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
    <header className="header">
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
              className="header__tab"
              href={hrefFor(tab.route)}
              aria-current={current === tab.route.page ? 'page' : undefined}
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
