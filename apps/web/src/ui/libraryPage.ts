import type { LibraryKnowledge } from './analysis/libraryKnowledge'
import { APP_NAME } from '../appName'
import { PAGE_RULES } from './pageRules'
import type { OwnPage } from './pageRules'
import type { Route } from './route'

/**
 * Which page stands in the main area. A library with no result is never the landing page: it has its own
 * page (`held`), and a library that has not answered has the restoring page, or an error.
 * - `profile`: Profile, whatever else is true.
 * - `result`: the page the route names, from a result.
 * - `method`: How sure is this? with no result, which is its own page. Which pages stand like this is
 *   PAGE_RULES' ownPage.
 * - `restoring`: a library is being restored or loaded.
 * - `unavailable`: the library could not be loaded or read.
 * - `held`: a library is present and its results are not shown (updating, or nothing readable yet). Its
 *   counts are known by then: until the library read answers, the list of saved runs is there but the counts
 *   are not, so the restoring page stays.
 * - `landing`: nothing is there.
 */
export type LibraryPage = OwnPage | 'result' | 'restoring' | 'unavailable' | 'held' | 'landing'

export interface LibraryPageInputs {
  route: Route
  hasResult: boolean
  knowledge: LibraryKnowledge
  /** A kept library is restoring (the hint from a previous visit). */
  restoring: boolean
  /** The library was asked for and could not be loaded or read. */
  failed: boolean
  /** A signed-in library read is still owed, so the counts the held page reads are not in yet. */
  loading?: boolean
}

export function libraryPageOf({
  route,
  hasResult,
  knowledge,
  restoring,
  failed,
  loading = false,
}: LibraryPageInputs): LibraryPage {
  const { ownPage, ownOverResult } = PAGE_RULES[route.page]
  if (ownPage !== null && ownOverResult) return ownPage
  if (hasResult) return 'result'
  if (ownPage !== null) return ownPage
  if (knowledge === 'unknown') return failed && !restoring ? 'unavailable' : 'restoring'
  if (knowledge !== 'present') return 'landing'
  return restoring || loading ? 'restoring' : 'held'
}

/** A string that changes whenever a different page is on screen, so focus moves to its heading. */
export function pageKeyOf(route: Route, page: LibraryPage): string {
  if (page === 'result') return route.page === 'activity' ? `activity:${route.id}` : route.page
  return page === 'method' ? 'method-empty' : page
}

/**
 * The tab title of a page that has no route name of its own: the held, restoring and error pages. Null for the
 * others, whose titles come from the route. `held` is the held page's heading, which says which state it is in.
 */
export function libraryPageTitle(page: LibraryPage, held: string): string | null {
  const name =
    page === 'held'
      ? held
      : page === 'restoring'
        ? 'Restoring your results'
        : page === 'unavailable'
          ? 'Your library is not showing yet'
          : null
  return name === null ? null : `${name} · ${APP_NAME}`
}
