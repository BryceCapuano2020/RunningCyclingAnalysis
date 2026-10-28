import { DRIFT, LATE_IN_EFFORT, PRIORS } from '@rca/core/constants'
import type { DriftPoint, LateEvidence, PeriodDurabilityRow } from '@rca/core/digest'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { Sport } from '@rca/core/types'
import { plural } from './components/plural'
import { effortLabel } from './records'
import { SPORT_ACTIVITY, SPORT_PLURAL } from './sports'

/** The section's name, in its heading and in the page's "Not enough yet" list. */
export const LATE_IN_EFFORT_NAME = 'Late in long sessions'

const { minActivities, referenceDecouplingPct } = LATE_IN_EFFORT

/** A late best in the sport's own number: speed in m/s for a run, watts for a ride. */
export interface LateCell {
  afterS: number
  value: number
  /** The late best over the best overall, in the own number. Below 1 means output fades. */
  retention: number
  /** Activities with an effort that late at this duration. */
  supporters: number
}

/** One duration: the best overall, at any point in an effort, and the late bests that enough activities support, shallowest first. */
export interface LateGroup {
  durationS: number
  overall: { value: number; supporters: number }
  cells: LateCell[]
}

export interface DurabilityReading {
  lede: string
  groups: LateGroup[]
  /** How the lede's figure is supported, and what it does not say. */
  note: string
}

export interface DriftReading {
  lede: string
  points: DriftPoint[]
  note: string
}

/** What the section says: each half is null while its evidence is short of minActivities. */
export interface LateInEffort {
  durability: DurabilityReading | null
  drift: DriftReading | null
  /** What is missing, in the plain words a "Not enough yet" line gives after the section's name; null when nothing is. */
  need: string | null
}

/**
 * A run's late bests are metabolic W/kg; the page reads them as the flat speed that costs it, as its best
 * efforts are read. A ride's are watts already. Keyed by Sport so a sport adds its own.
 */
const NATIVE: Record<Sport, (value: number) => number> = {
  run: (wkg) => metabolicToFlatSpeed(wkg, PRIORS.runEconomyScale.mean),
  ride: (watts) => watts,
}

/** What a sport's late bests count, where it is less than everything. */
const COUNTS: Record<Sport, string> = {
  run: '',
  ride: ' Counts rides with a power meter.',
}

/** What a sport's late bests need of a file besides its length. */
const NEEDS_DEVICE: Record<Sport, string> = {
  run: '',
  ride: ' with a power meter',
}

/** The cell of a row's late best, or null while fewer than minActivities support it. */
function cellOf(sport: Sport, row: PeriodDurabilityRow, afterIndex: number): LateCell | null {
  const after = row.after[afterIndex]
  const { fresh } = row
  if (
    after === undefined ||
    after.best === null ||
    fresh === null ||
    after.best.supporters < minActivities
  )
    return null
  const value = NATIVE[sport](after.best.value)
  return {
    afterS: after.afterS,
    value,
    retention: value / NATIVE[sport](fresh.value),
    supporters: after.best.supporters,
  }
}

/** The groups of durations that have a late best enough activities support. */
function groupsOf(sport: Sport, rows: readonly PeriodDurabilityRow[]): LateGroup[] {
  return rows.flatMap((row) => {
    const cells = row.after.flatMap((_, i) => cellOf(sport, row, i) ?? [])
    return row.fresh === null || cells.length === 0
      ? []
      : [
          {
            durationS: row.durationS,
            overall: { value: NATIVE[sport](row.fresh.value), supporters: row.fresh.supporters },
            cells,
          },
        ]
  })
}

/** A time into an effort as it follows "After": "60 min", "90 min". */
export function afterLabel(afterS: number): string {
  return effortLabel(afterS)
}

/** How far a late best is below the best overall, in whole percent; negative when it is above. */
export function fadePercent(retention: number): number {
  return Math.round((1 - retention) * 100)
}

/**
 * The lede: how far the best at a duration falls once an effort is that old, against the best at that
 * duration overall. A difference under 1% reads as within 1%, since a whole percent is the figure's precision.
 */
export function durabilityLede(afterS: number, durationS: number, retention: number): string {
  const percent = fadePercent(retention)
  const effort = effortLabel(durationS)
  const opening = `After ${afterLabel(afterS)} your best ${effort}`
  if (percent >= 1) return `${opening} is ${percent}% below your best ${effort} overall.`
  if (percent <= -1) return `${opening} is ${-percent}% above your best ${effort} overall.`
  return `${opening} is within 1% of your best ${effort} overall.`
}

/**
 * The deepest level that has support, at the longest duration it has support for: the figure the lede
 * quotes. A longer duration says more about staying power, a deeper level more about the late part.
 */
function ledeCell(groups: readonly LateGroup[]): { group: LateGroup; cell: LateCell } {
  const deepest = Math.max(...groups.flatMap((group) => group.cells.map((cell) => cell.afterS)))
  const group = groups.findLast((g) => g.cells.some((c) => c.afterS === deepest))!
  return { group, cell: group.cells.find((c) => c.afterS === deepest)! }
}

function durabilityReading(
  sport: Sport,
  rows: readonly PeriodDurabilityRow[],
): DurabilityReading | null {
  const groups = groupsOf(sport, rows)
  if (groups.length === 0) return null
  const { group, cell } = ledeCell(groups)
  const support = `Your best ${effortLabel(group.durationS)} after ${afterLabel(cell.afterS)} rests on ${plural(cell.supporters, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport])}.`
  const limit = `A lower figure late on can also mean the ${SPORT_ACTIVITY[sport]} never asked for more.`
  return {
    lede: durabilityLede(cell.afterS, group.durationS, cell.retention),
    groups,
    note: `${support} ${limit}${COUNTS[sport]}`,
  }
}

/** The middle of the values: the mean of the two middle ones for an even count. */
export function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** What a steady effort's output per heartbeat did, from its decoupling in percent: a change under 1% reads as level. */
export function driftChange(decouplingPct: number): string {
  const percent = Math.round(decouplingPct)
  if (percent >= 1) return `fell ${percent}%`
  if (percent <= -1) return `rose ${-percent}%`
  return 'held level'
}

/** The lede: what the middle steady effort's output per heartbeat did from its first half to its second. */
export function driftLede(sport: Sport, medianPct: number, count: number): string {
  const efforts = plural(count, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport])
  return `On steady ${SPORT_PLURAL[sport]} over an hour, your output per heartbeat ${driftChange(medianPct)} from the first half to the second (median of ${efforts}).`
}

function driftReading(sport: Sport, points: readonly DriftPoint[]): DriftReading | null {
  if (points.length < minActivities) return null
  const median = medianOf(points.map((p) => p.decouplingPct))
  const warmup = DRIFT.warmupS / 60
  return {
    lede: driftLede(sport, median, points.length),
    points: [...points],
    note: `Each dot is one steady ${SPORT_ACTIVITY[sport]}: output per heartbeat in the first half of its moving time against the second, after a ${warmup}-minute warm-up. Only ${SPORT_PLURAL[sport]} that stayed even count. Heat, hydration and tiredness also move heart rate, so a change is not fitness.`,
  }
}

/** The line a drift chart draws at the common reference, in words. */
export const DECOUPLING_REFERENCE = `A fall of ${referenceDecouplingPct}%: under this is usually read as well-built endurance`

/** What drift needs of a file besides its length: a heart rate, and for a ride a power meter. Keyed by Sport. */
const DRIFT_NEEDS_DEVICE: Record<Sport, string> = {
  run: 'heart rate',
  ride: 'a power meter and heart rate',
}

/** What late bests need, counting the activities a level already has. */
function durabilityNeed(sport: Sport, evidence: LateEvidence): string {
  const have = Math.max(0, ...evidence.durability.map((row) => row.after[0]?.best?.supporters ?? 0))
  const count = Math.max(1, minActivities - have)
  return `Add ${plural(count, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport])} longer than an hour${NEEDS_DEVICE[sport]}.`
}

/** What drift needs: steady efforts over an hour with the readings it compares. */
function driftNeed(sport: Sport): string {
  return `Needs ${minActivities} steady ${SPORT_PLURAL[sport]} over an hour with ${DRIFT_NEEDS_DEVICE[sport]} to show how output per heartbeat changes.`
}

/** What the section needs, in the plain words of the "Not enough yet" list: each missing half's need. */
function needOf(sport: Sport, evidence: LateEvidence, hasDurability: boolean, hasDrift: boolean) {
  return [
    hasDurability ? null : durabilityNeed(sport, evidence),
    hasDrift ? null : driftNeed(sport),
  ]
    .filter((need) => need !== null)
    .join(' ')
}

/**
 * What a sport's late bests and drift say. Durability needs minActivities activities at a level; drift
 * needs as many steady efforts. A half that falls short is left out and named in the lack, so the page
 * never shows a figure one activity stands behind.
 */
export function lateInEffort(sport: Sport, evidence: LateEvidence): LateInEffort {
  const durability = durabilityReading(sport, evidence.durability)
  const drift = driftReading(sport, evidence.drift)
  const need =
    durability !== null && drift !== null
      ? null
      : needOf(sport, evidence, durability !== null, drift !== null)
  return { durability, drift, need }
}
