import type { ActivityDigest } from '../types'
import { canonicalOrder } from './ordered'
import { REVISIONS, revisionStatus, stepsFrom } from './revisions'
import type { RevisionDeclaration } from './revisions'

/**
 * Every reader of the library's digests, and which digests it reads. `readable` is current plus compatible
 * (see `revisionStatus`); `current` is current only. A revision's `holdsBack` can narrow a `readable`
 * consumer to current for that revision. At revision 6 nothing is compatible, so every consumer reads
 * current digests only.
 *
 * Each name is called at one or more `orderedFor(...)` sites in packages/core and the worker; `consumers.test.ts`
 * reads those sites, so a reader added without a name here, or a name with no reader, fails the build.
 */
export const CONSUMERS = {
  combine: 'readable', // bests, Balance, critical power, race predictions
  rideCurves: 'readable',
  trend: 'readable', // headline trend series
  previousPeriods: 'readable', // previous-period curves and comparisons
  change: 'readable', // readings behind the change test
  setAside: 'readable', // whose heart rate is set aside
  referenceHr: 'readable', // reference maxima, zones, observed max
  sameHeartRate: 'readable',
  lateEvidence: 'readable', // durability, drift
  thresholdTimeline: 'readable',
  zones: 'readable', // zone estimates and time in zones
  records: 'readable',
  findings: 'readable',
  fitness: 'readable', // the run and ride monitors
  splits: 'readable', // the activity page's splits
  listing: 'readable', // the library summaries
} as const satisfies Record<string, 'readable' | 'current'>

export type Consumer = keyof typeof CONSUMERS

/** The same table with its rule widened, so a consumer can be moved to `current` without a type error. */
const RULES: Readonly<Record<Consumer, 'readable' | 'current'>> = CONSUMERS

/**
 * Consumers that have no `orderedFor` call of their own: they receive an array `buildState` has already
 * filtered, or are computed inside another consumer (referenceHr, thresholdTimeline and zones inside the
 * heart-rate judgement, which is `setAside`'s). Their rule in `CONSUMERS` is not applied to anything, so a
 * revision's `affects` and `holdsBack` cannot name them (`DirectConsumer`). The guard test checks that no
 * consumer is both direct and indirect; a test through `buildState` comes with the readable input (PR B).
 */
export const INDIRECT = {
  previousPeriods: 'the previous period of the analysed digests',
  referenceHr: 'the analysed digests through the heart-rate judgement',
  lateEvidence: 'the selected period of the analysed digests',
  thresholdTimeline: 'the selected period of the analysed digests',
  zones: 'the analysed digests through the heart-rate judgement',
  splits: 'the one digest of the activity page',
} as const satisfies Partial<Record<Consumer, string>>

/** A consumer with its own `orderedFor` call: the only kind a revision can hold back or flag as affected. */
export type DirectConsumer = Exclude<Consumer, keyof typeof INDIRECT>

/** Whether `consumer` reads a digest of `revision` under `table`. */
export function readsRevision(
  consumer: Consumer,
  revision: number,
  table: readonly RevisionDeclaration[] = REVISIONS,
): boolean {
  const status = revisionStatus(revision, table)
  if (status === 'current') return true
  if (status !== 'compatible' || RULES[consumer] === 'current') return false
  const heldBack = (step: RevisionDeclaration): readonly Consumer[] => step.holdsBack ?? []
  return !stepsFrom(revision, table).some((step) => heldBack(step).includes(consumer))
}

/** The digests `consumer` reads, in canonical order. Every reader of the library calls this by name. */
export function orderedFor(
  consumer: Consumer,
  digests: ActivityDigest[],
  table: readonly RevisionDeclaration[] = REVISIONS,
): ActivityDigest[] {
  return digests
    .filter((digest) => readsRevision(consumer, digest.modelRevision, table))
    .sort(canonicalOrder)
}
