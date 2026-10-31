import { DAY_MS } from '../constants'
import { driftTrend } from '../digest/driftTrend'
import { periodDurability } from '../digest/durabilityPeriod'
import { sameHeartRate } from '../digest/sameHeartRate'
import { weekEndFor, weekEndInstant, weekEndsSpan } from '../calendar'
import type { ActivityDigest, Sport } from '../types'
import { changepoint } from './changepoint'
import { FINDINGS, perSport } from './constants'
import type {
  SharedTables,
  SourceChange,
  SourceKind,
  Span,
  WeekCoverage,
  WeekSeconds,
} from './types'

const WEEK_MS = 7 * DAY_MS

/** Seconds the device was recording; digests from before it was kept fall back to the whole duration. */
function movingSeconds(digest: ActivityDigest): number {
  return digest.movingS ?? digest.durationS
}

/** Every week from the first activity's to the one that ends at or after asOfMs, quiet weeks as zero. */
function weeklyMoving(mine: readonly ActivityDigest[], asOfMs: number): WeekSeconds[] {
  return weekly(mine, asOfMs, (endMs, complete): WeekSeconds => ({
    endMs,
    seconds: 0,
    activities: 0,
    complete,
  })).map(({ week, digests }) => {
    for (const digest of digests) {
      week.seconds += movingSeconds(digest)
      week.activities++
    }
    return week
  })
}

function weeklyCoverage(mine: readonly ActivityDigest[], asOfMs: number): WeekCoverage[] {
  return weekly(mine, asOfMs, (endMs, complete): WeekCoverage => ({
    endMs,
    activities: 0,
    withHeartRate: 0,
    withMeasuredPower: 0,
    complete,
  })).map(({ week, digests }) => {
    for (const digest of digests) {
      week.activities++
      if (digest.hasHeartRate) week.withHeartRate++
      if (digest.powerSource === 'measured') week.withMeasuredPower++
    }
    return week
  })
}

/** One empty record for each week from the first activity's to asOfMs's, with the digests that fall in it. */
function weekly<W extends { endMs: number }>(
  mine: readonly ActivityDigest[],
  asOfMs: number,
  empty: (endMs: number, complete: boolean) => W,
): { week: W; digests: ActivityDigest[] }[] {
  if (mine.length === 0) return []
  const span = weekEndsSpan(mine)!
  const first = span.first
  const last = Math.max(span.last, weekEndFor({ startMs: asOfMs }))
  // A week is complete once its Sunday is over at asOfMs, an instant: its end is a label, so it is made one too.
  const weeks: { week: W; digests: ActivityDigest[] }[] = []
  for (let endMs = first; endMs <= last; endMs += WEEK_MS) {
    weeks.push({ week: empty(endMs, weekEndInstant(endMs) <= asOfMs), digests: [] })
  }
  for (const digest of mine) {
    weeks[Math.round((weekEndFor(digest) - first) / WEEK_MS)]!.digests.push(digest)
  }
  return weeks
}

/** The share of a week's activities that have a source; NaN in a week without activities. */
const SHARE: Record<SourceKind, (week: WeekCoverage) => number> = {
  heartRate: (week) => week.withHeartRate / week.activities,
  power: (week) => week.withMeasuredPower / week.activities,
}

/** The share of activities with a source in the weeks that end inside the span; NaN without activities. */
export function coverageShare(
  coverage: readonly WeekCoverage[],
  source: SourceKind,
  span: Span,
): number {
  const inside = coverage.filter((w) => w.endMs > span.fromMs && w.endMs <= span.toMs)
  const activities = inside.reduce((sum, w) => sum + w.activities, 0)
  const withSource = inside.reduce(
    (sum, w) => sum + (source === 'heartRate' ? w.withHeartRate : w.withMeasuredPower),
    0,
  )
  return activities === 0 ? Number.NaN : withSource / activities
}

const COUNT: Record<SourceKind, (week: WeekCoverage) => number> = {
  heartRate: (week) => week.withHeartRate,
  power: (week) => week.withMeasuredPower,
}

/** The weighted share of activities with a source in the weeks, and how many activities that is. */
function pooled(weeks: readonly WeekCoverage[], source: SourceKind): { share: number; n: number } {
  const n = weeks.reduce((sum, w) => sum + w.activities, 0)
  return { share: weeks.reduce((sum, w) => sum + COUNT[source](w), 0) / n, n }
}

/**
 * The step of 30 points or more in a source's share, if the weekly shares have one that the activities
 * bear out: the best split of the weeks (complete ones with activities), and a two-proportion z of at
 * least FINDINGS.sourceStepZ between the activities each side, so a run of unlucky weeks is not a step.
 */
function sourceChangesOf(coverage: readonly WeekCoverage[]): SourceChange[] {
  const changes: SourceChange[] = []
  const weeks = coverage.filter((w) => w.complete && w.activities > 0)
  for (const source of ['heartRate', 'power'] as const) {
    const found = changepoint(weeks.map(SHARE[source]), SOURCE_MIN_WEEKS)
    if (found === null) continue
    const before = pooled(weeks.slice(0, found.index), source)
    const after = pooled(weeks.slice(found.index), source)
    const all = pooled(weeks, source)
    const se = Math.sqrt(all.share * (1 - all.share) * (1 / before.n + 1 / after.n))
    const z = se > 0 ? Math.abs(after.share - before.share) / se : 0
    if (Math.abs(after.share - before.share) < FINDINGS.sourceShift || z < FINDINGS.sourceStepZ)
      continue
    changes.push({
      source,
      atMs: weeks[found.index]!.endMs,
      before: before.share,
      after: after.share,
    })
  }
  return changes
}

/** The fewest weeks each side of a step in coverage. */
const SOURCE_MIN_WEEKS = 4

/** A table worked out the first time it is read, and kept: the detectors that do not read it do not pay for it. */
function lazily<K extends keyof SharedTables>(
  tables: SharedTables,
  key: K,
  compute: () => SharedTables[K],
): void {
  let value: { done: false } | { done: true; result: SharedTables[K] } = { done: false }
  Object.defineProperty(tables, key, {
    enumerable: true,
    get: () => {
      if (!value.done) value = { done: true, result: compute() }
      return value.result
    },
  })
}

/**
 * What the detectors share, worked out once for the library, whatever period the app shows, and only
 * when a detector reads it (the same-heart-rate fits are most of the cost). `digests` are the current
 * model's, in canonical order, none after asOfMs. The same-heart-rate fits are the library's own, read
 * at its reference heart rate; activities whose heart rate is set aside are left out of the drift
 * points as they are of the fits.
 */
export function buildTables(
  digests: ActivityDigest[],
  setAside: ReadonlySet<string>,
  asOfMs: number,
): SharedTables {
  const mine = (sport: Sport) => digests.filter((d) => d.sport === sport)
  const tables = {} as SharedTables
  lazily(tables, 'sameHeartRate', () => sameHeartRate(digests, setAside, {}))
  lazily(tables, 'weeklyMoving', () => perSport((sport) => weeklyMoving(mine(sport), asOfMs)))
  lazily(tables, 'coverage', () => perSport((sport) => weeklyCoverage(mine(sport), asOfMs)))
  lazily(tables, 'sourceChanges', () =>
    perSport((sport) => sourceChangesOf(weeklyCoverage(mine(sport), asOfMs))),
  )
  lazily(tables, 'drift', () =>
    perSport((sport) =>
      driftTrend(
        mine(sport).filter((d) => !setAside.has(d.id)),
        sport,
      ),
    ),
  )
  lazily(tables, 'durability', () => perSport((sport) => periodDurability(digests, sport)))
  lazily(tables, 'firstMs', () => perSport((sport) => mine(sport)[0]?.startMs ?? null))
  return tables
}
