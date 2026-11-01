/**
 * The pages whose address is just their name. Every list of pages is read from this one: the route
 * type, the address parser, the tab titles and the rules below. Balance is first, and an unknown
 * address shows it.
 */
export const SIMPLE_PAGES = [
  'balance',
  'run',
  'ride',
  'history',
  'activities',
  'method',
  'profile',
] as const

export type SimplePage = (typeof SIMPLE_PAGES)[number]

/** Every page, including an activity, whose address carries an id. */
export type PageName = SimplePage | 'activity'

/**
 * A page that has content of its own and stands in the main area without endurance files. It is also
 * a kind of LibraryPage. A page that opens with no files, such as a lifting log, is added here and in
 * PAGE_RULES, and nowhere else.
 */
export type OwnPage = 'profile' | 'method'

export interface PageRule {
  /**
   * The page shows only from an endurance result. Without one, a deep link gets the "add your files"
   * notice, and an import started there moves the visitor to Balance when it lands.
   */
  needsResult: boolean
  /** The page of its own that stands in the main area with no result, or null to follow the library. */
  ownPage: OwnPage | null
  /** The own page also stands over a result: Profile does, and How sure is this? gives way to one. */
  ownOverResult: boolean
}

/** What each page needs. A page missing here is a type error, so a new page must say what it needs. */
export const PAGE_RULES: Record<PageName, PageRule> = {
  balance: { needsResult: false, ownPage: null, ownOverResult: false },
  run: { needsResult: true, ownPage: null, ownOverResult: false },
  ride: { needsResult: true, ownPage: null, ownOverResult: false },
  history: { needsResult: true, ownPage: null, ownOverResult: false },
  activities: { needsResult: true, ownPage: null, ownOverResult: false },
  activity: { needsResult: true, ownPage: null, ownOverResult: false },
  method: { needsResult: false, ownPage: 'method', ownOverResult: false },
  profile: { needsResult: false, ownPage: 'profile', ownOverResult: true },
}
