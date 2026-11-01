import { calendarKey } from './calendar'
import type { ActivityDigest } from './types'

/** Whether two sets of ids hold the same members. */
export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a === b || (a.size === b.size && [...a].every((id) => b.has(id)))
}

/**
 * A function of a list of digests and one more input, remembered for the last few calls. A call finds its answer
 * when the digests are the same objects in the same order and the other input is the same by `sameInput`, however
 * the list was made, so a change of body mass or settings, which the function does not read, does not redo it.
 * Answers are kept by the first digest of the list, so they go when the library does. They are shared, so a
 * function whose answer a caller changes should return a copy (`copy`). The list is copied, so a caller that later
 * changes its own array cannot make a stale answer match. An answer also holds only while the calendar (local weeks
 * on or off, the viewer's zone) is the one it was made under.
 */
export function memoByDigests<I, R>(
  compute: (digests: ActivityDigest[], input: I) => R,
  sameInput: (a: I, b: I) => boolean,
  copy: (answer: R) => R = (answer) => answer,
  kept = 4,
): (digests: ActivityDigest[], input: I) => R {
  interface Entry {
    digests: ActivityDigest[]
    input: I
    calendar: number
    answer: R
  }
  const entries = new WeakMap<ActivityDigest, Entry[]>()
  return (digests, input) => {
    const calendar = calendarKey()
    const first = digests[0]
    if (first === undefined) return compute(digests, input)
    const own = entries.get(first) ?? []
    const hit = own.find(
      (entry) =>
        entry.digests.length === digests.length &&
        entry.calendar === calendar &&
        entry.digests.every((digest, i) => digest === digests[i]) &&
        sameInput(entry.input, input),
    )
    if (hit !== undefined) return copy(hit.answer)
    const answer = compute(digests, input)
    entries.set(
      first,
      [{ digests: digests.slice(), input, calendar, answer: copy(answer) }, ...own].slice(0, kept),
    )
    return answer
  }
}
