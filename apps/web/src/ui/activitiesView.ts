import { ACTIVITY_SORTS, type ActivitySort } from './activitySort'
import { hashQuery } from './route'

export type SportFilter = 'all' | 'run' | 'ride'

/** What the Activities list shows, and the page of it. The address keeps it, so Back returns to it. */
export interface ActivitiesView {
  sport: SportFilter
  sort: ActivitySort
  /** A period in days, or 'all' for the whole library. */
  period: 'all' | number
  /** The page shown, counted from zero. */
  page: number
}

/** The whole library, newest first, on its first page. */
export const DEFAULT_VIEW: ActivitiesView = { sport: 'all', sort: 'newest', period: 'all', page: 0 }

const SPORTS: readonly SportFilter[] = ['all', 'run', 'ride']

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback
}

/** A positive whole number of days, or 'all' for anything else. */
function periodOf(value: string | null): 'all' | number {
  const days = Number(value)
  return value !== null && Number.isInteger(days) && days > 0 ? days : 'all'
}

/** The page in the address counts from one, as a reader would; anything else is the first page. */
function pageOf(value: string | null): number {
  const page = Number(value)
  return value !== null && Number.isInteger(page) && page >= 1 ? page - 1 : 0
}

/** The view a query names. Any value it does not know falls back to the default. */
export function viewFromQuery(query: URLSearchParams): ActivitiesView {
  return {
    sport: oneOf(query.get('sport'), SPORTS, DEFAULT_VIEW.sport),
    sort: oneOf(query.get('sort'), ACTIVITY_SORTS, DEFAULT_VIEW.sort),
    period: periodOf(query.get('period')),
    page: pageOf(query.get('page')),
  }
}

/** The query that names a view, with each part left out when it is the default. */
export function queryFromView(view: ActivitiesView): string {
  const query = new URLSearchParams()
  if (view.sport !== DEFAULT_VIEW.sport) query.set('sport', view.sport)
  if (view.sort !== DEFAULT_VIEW.sort) query.set('sort', view.sort)
  if (view.period !== DEFAULT_VIEW.period) query.set('period', String(view.period))
  if (view.page > 0) query.set('page', String(view.page + 1))
  return query.toString()
}

/** The address marker a page sends the list after a removal it made, so the list announces it once. */
const REMOVED_QUERY = 'removed'

/** The list's address, marked as coming after a removal. The list drops the marker once it has read it. */
export function removedHash(): string {
  return `#/activities?${REMOVED_QUERY}=1`
}

/** Whether a hash carries the marker a removal left, such as '#/activities?removed=1'. */
export function hasRemovedMark(hash: string): boolean {
  return hashQuery(hash).has(REMOVED_QUERY)
}
