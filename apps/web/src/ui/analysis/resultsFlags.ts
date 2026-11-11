import type { AccountResults } from './accountResults'

/**
 * Whether the page waits for an account's results, or could not get them. A signed-in account with none yet shows its loading state, not
 * an empty library. So does one whose results are older than its library: a snapshot the server served from its store while it computes
 * (not current, or a copy kept from an earlier visit) with nothing in it, while the index lists activities or the snapshot is of a
 * library version behind the one the index was listed at. Results with something to show stay on screen while the server catches up:
 * replacing a page in use would drop what the visitor is doing on it. One the server could not answer says so, with a retry, unless the library read itself failed
 * (its notice has it). `listed` is how many activities the index lists.
 */
export function resultsFlags(
  userId: string | null,
  {
    results,
    failed,
    listedVersion,
  }: { results: AccountResults | null; failed: boolean; listedVersion: number | null },
  libraryStatus: string,
  listed: number,
): { resultsWaiting: boolean; resultsFailed: boolean } {
  if (userId === null) return { resultsWaiting: false, resultsFailed: false }
  const behind =
    results === null ||
    // Only results with nothing to show can be taken for an empty library; ones with something to show stay up while the server catches up.
    (!results.current &&
      results.state.result === null &&
      (listed > 0 || (listedVersion !== null && results.snapshot.libraryVersion < listedVersion)))
  return {
    resultsWaiting: behind && !failed,
    resultsFailed: behind && failed && libraryStatus !== 'failed',
  }
}
