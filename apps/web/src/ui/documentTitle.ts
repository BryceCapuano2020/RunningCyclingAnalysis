import { useEffect } from 'react'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { APP_NAME } from '../appName'
import { PAGE_RULES } from './pageRules'
import type { SimplePage } from './pageRules'
import type { Route } from './route'
import { SPORT_LABEL } from './sports'

const PAGE_NAMES: Record<SimplePage, string> = {
  balance: 'Balance',
  run: SPORT_LABEL.run,
  ride: SPORT_LABEL.ride,
  activities: 'Activities',
  method: 'How sure is this?',
  profile: 'Profile',
}

/** The page's name, or null on the landing page, which is the app itself. */
function nameOf(
  route: Route,
  result: AnalysisResult | null,
  library: readonly ActivitySummary[],
): string | null {
  if (route.page === 'activity') {
    if (result === null) return null
    // The whole library, so an activity outside the period still has its own name.
    const name = library.find((activity) => activity.id === route.id)?.name.trim()
    return name || 'Activity'
  }
  // A page with content of its own shows without a result, so it keeps its name.
  if (result === null && PAGE_RULES[route.page].ownPage === null) return null
  return PAGE_NAMES[route.page]
}

/**
 * The tab title for a route: the page's name and the app name, which tabs, history and bookmarks show.
 * The library defaults to the result's activities, which are the period's.
 */
export function documentTitleFor(
  route: Route,
  result: AnalysisResult | null,
  library: readonly ActivitySummary[] = result?.activities ?? [],
): string {
  const name = nameOf(route, result, library)
  return name === null ? APP_NAME : `${name} · ${APP_NAME}`
}

/** Sets the document title to the title given, whenever it changes. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}
