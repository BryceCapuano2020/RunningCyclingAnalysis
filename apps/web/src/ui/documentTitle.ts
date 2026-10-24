import { useEffect } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import { APP_NAME } from '../appName'
import type { Route } from './route'
import { SPORT_LABEL } from './sports'

const PAGE_NAMES: Record<Exclude<Route['page'], 'activity'>, string> = {
  balance: 'Balance',
  run: SPORT_LABEL.run,
  ride: SPORT_LABEL.ride,
  activities: 'Activities',
  method: 'How sure is this?',
  profile: 'Profile',
}

/** The page's name, or null on the landing page, which is the app itself. */
function nameOf(route: Route, result: AnalysisResult | null): string | null {
  if (route.page === 'profile') return PAGE_NAMES.profile
  if (result === null) return null
  if (route.page === 'activity') {
    const name = result.activities.find((activity) => activity.id === route.id)?.name.trim()
    return name || 'Activity'
  }
  return PAGE_NAMES[route.page]
}

/** The tab title for a route: the page's name and the app name, which tabs, history and bookmarks show. */
export function documentTitleFor(route: Route, result: AnalysisResult | null): string {
  const name = nameOf(route, result)
  return name === null ? APP_NAME : `${name} · ${APP_NAME}`
}

/** Sets the document title to the title given, whenever it changes. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}
