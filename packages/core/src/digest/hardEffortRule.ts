import { sessionVerdict } from '../effort'
import type { EffortReference } from '../effort'
import type { ActivityDigest } from '../types'
import { effortsCount } from './effortTrust'
import type { KeyedReadingRule } from './readingRule'

/**
 * The reading rule the change test reads efforts through, with the effort gate (D1) plugged in: an activity counts
 * unless its own heart rate shows it was not a hard effort, so a period of mostly easy rides is not set against one of
 * mostly hard rides (the swing in hard share that breaks the test's exchangeability). It is the session test a late
 * best uses: `notHard` is a peak under the hard line, or a reference that cannot certify one. An activity that cannot be
 * judged (no heart rate, a heart rate set aside, too few days to set a reference) counts, since nothing shows it was
 * easy; the Balance headline is not held for it either, and says the effort was not checked.
 *
 * Only the test reads through it. The bests the pages show are the curves' own, every effort, so a demonstrated best
 * that was not hard still shows as a best; the strip withholds a comparison whose shown best was not hard.
 */
export function hardEffortRule(
  reference: EffortReference,
  setAside: readonly string[],
): KeyedReadingRule {
  const aside = new Set(setAside)
  const notHard = (digest: ActivityDigest): boolean =>
    !aside.has(digest.id) &&
    sessionVerdict(digest, reference.referenceHr[digest.sport], reference.reading[digest.sport]) ===
      'notHard'
  return {
    rule: {
      activity: (digest) => effortsCount(digest) && !notHard(digest),
      point: () => true,
    },
    key: `hard|${JSON.stringify([reference.referenceHr, reference.reading])}|${setAside.join(',')}`,
  }
}
