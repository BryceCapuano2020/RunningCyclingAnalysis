import { useRef } from 'react'
import type { ReactNode } from 'react'
import { APP_WORDS } from '../../appName'
import type { Route } from '../route'
import { hrefFor } from '../route'
import { ariaCurrentOf, sectionOf } from './sectionOf'
import { useHeaderHeight } from './useHeaderHeight'
import './Header.css'

export interface HeaderProps {
  /** The current page, which the page links and the Profile link mark as current. */
  route: Route | null
  /** Shows History, Activities and Method: only once there is a result to navigate. */
  showTabs?: boolean
  /** The Add files button. */
  addFiles?: ReactNode
  /** The account control. */
  account?: ReactNode
}

/** The pages the header links to. Balance, Run and Ride are the rail's (Rail.tsx). */
const PAGES: { label: string; page: 'history' | 'activities' | 'method' }[] = [
  { label: 'History', page: 'history' },
  { label: 'Activities', page: 'activities' },
  { label: 'Method', page: 'method' },
]

/**
 * The header is one line: the wordmark, History, Activities and Method as text links, then Profile, the account and Add
 * files at the right, with a hairline under it.
 */
export function Header({ route, showTabs = route !== null, addFiles, account }: HeaderProps) {
  const current = route ? sectionOf(route) : null
  const headerRef = useRef<HTMLElement>(null)
  useHeaderHeight(headerRef)
  return (
    <header ref={headerRef} className="header">
      <a className="header__brand" href={hrefFor({ page: 'balance' })}>
        {APP_WORDS}
      </a>
      {showTabs && (
        <nav className="header__pages" aria-label="More pages">
          {PAGES.map(({ label, page }) => (
            <a
              key={page}
              className={`header__link header__link--${page}${current === page ? ' header__link--current' : ''}`}
              href={hrefFor({ page })}
              aria-current={ariaCurrentOf(route, page, current)}
            >
              {label}
            </a>
          ))}
        </nav>
      )}
      <div className="header__actions">
        <a
          className="header__link header__profile"
          href={hrefFor({ page: 'profile' })}
          aria-current={route?.page === 'profile' ? 'page' : undefined}
        >
          Profile
        </a>
        <div className="header__account">{account}</div>
        {addFiles}
      </div>
    </header>
  )
}
