import type { LibraryStatus } from './model'

/**
 * What the page knows about the athlete's library, which is not the same as having a result. A library
 * whose digests are all held out has no result and is still a library: the landing page, the empty state
 * and the cold-link notice are for `empty` only.
 * - `present`: a result, a saved or kept activity, a held digest of any status, or rows that could not be read.
 * - `unknown`: a kept library is restoring, the signed-in library has not loaded (or failed to), or this
 *   browser's library could not be read. The restoring page or an error with a retry shows.
 * - `empty`: everything has answered and nothing is there.
 */
export type LibraryKnowledge = 'unknown' | 'empty' | 'present'

export interface KnowledgeInputs {
  hasResult: boolean
  signedIn: boolean
  libraryStatus: LibraryStatus
  /** A kept library is restoring. */
  restoring: boolean
  /** The saved activities the worker lists (the server's, or this browser's). */
  saved: number
  /** Every digest the session holds, whatever its status. */
  held: number
  /** Rows the library could not read. */
  unreadable: number
  /** This browser's library could not be opened or read. */
  deviceUnreadable: boolean
}

export function libraryKnowledgeOf(i: KnowledgeInputs): LibraryKnowledge {
  if (i.hasResult || i.saved > 0 || i.held > 0 || i.unreadable > 0) return 'present'
  if (i.restoring || i.deviceUnreadable) return 'unknown'
  if (i.signedIn && i.libraryStatus !== 'loaded') return 'unknown'
  return 'empty'
}
