import { LATE_IN_EFFORT, PRIORS } from '@rca/core/constants'
import type { DriftPoint, LateEvidence, PeriodDurabilityRow } from '@rca/core/digest'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { Sport } from '@rca/core/types'
import { plural } from './components/plural'
import { durabilityStat, driftFinding, driftLede } from './lateInEffortCopy'
import { SPORT_ACTIVITY, SPORT_PLURAL } from './sports'

export {
  DECOUPLING_REFERENCE,
  afterLabel,
  afterWords,
  driftChange,
  driftDescription,
  driftFinding,
  driftLede,
  durabilityStat,
  fadePercent,
} from './lateInEffortCopy'

/** The section's name, in its heading. */
export const LATE_IN_EFFORT_NAME = 'Durability'

const { minActivities } = LATE_IN_EFFORT

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
  /** The one figure the section opens with: "99% of your best 20 min after an hour". */
  stat: string
  groups: LateGroup[]
}

export interface DriftReading {
  /** What the middle steady effort's efficiency did, as the chart's headline. */
  lede: string
  /** Whether the whole library is read, as the period held too few steady efforts. */
  allTime: boolean
  /** The middle steady effort's decoupling in percent: a fall is positive. */
  medianPct: number
  points: DriftPoint[]
}

/** What the section says: each half is null while its evidence is short of minActivities. */
export interface LateInEffort {
  durability: DurabilityReading | null
  drift: DriftReading | null
  /** What the missing half needs, a plain sentence that names it, or one line to add for both; empty when nothing is missing. */
  needs: string[]
}

/**
 * A run's late bests are metabolic W/kg; the page reads them as the flat speed that costs it, as its best
 * efforts are read. A ride's are watts already. Keyed by Sport so a sport adds its own.
 */
const NATIVE: Record<Sport, (value: number) => number> = {
  run: (wkg) => metabolicToFlatSpeed(wkg, PRIORS.runEconomyScale.mean),
  ride: (watts) => watts,
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

/**
 * The deepest level that has support, at the longest duration it has support for: the figure the lede
 * quotes. A longer duration says more about staying power, a deeper level more about the late part.
 */
function ledeCell(groups: readonly LateGroup[]): { group: LateGroup; cell: LateCell } {
  const deepest = Math.max(...groups.flatMap((group) => group.cells.map((cell) => cell.afterS)))
  const group = groups.findLast((g) => g.cells.some((c) => c.afterS === deepest))!
  return { group, cell: group.cells.find((c) => c.afterS === deepest)! }
}

function durabilityReading(sport: Sport, evidence: LateEvidence): DurabilityReading | null {
  const groups = groupsOf(sport, evidence.durability)
  if (groups.length === 0) return null
  const { group, cell } = ledeCell(groups)
  // With no session behind it that a heart rate shows was hard, the share is a floor.
  const floor =
    evidence.ruler === null || evidence.ruler === undefined || evidence.ruler.sessions < 1
  return {
    stat: durabilityStat(group.durationS, cell.afterS, cell.retention, {
      floor,
      allTime: evidence.durabilityPooled === true,
    }),
    groups,
  }
}

/** The middle of the values: the mean of the two middle ones for an even count. */
export function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function driftReading(evidence: LateEvidence): DriftReading | null {
  const points = evidence.drift
  if (points.length < minActivities) return null
  const median = medianOf(points.map((p) => p.decouplingPct))
  return {
    lede: driftLede(median, evidence.driftPooled === true),
    allTime: evidence.driftPooled === true,
    medianPct: median,
    points: [...points],
  }
}

/** What drift needs of a file besides its length: a heart rate, and for a ride a power meter. Keyed by Sport. */
const DRIFT_NEEDS_DEVICE: Record<Sport, string> = {
  run: 'heart rate',
  ride: 'a power meter and heart rate',
}

/** What durability needs: long sessions, with a power meter for a ride. */
function durabilityNeed(sport: Sport): string {
  return `Durability needs ${plural(minActivities, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport])} longer than an hour${NEEDS_DEVICE[sport]}.`
}

/** What drift needs: steady efforts, each over an hour, with the readings it compares. */
function driftNeed(sport: Sport): string {
  return `Heart rate drift needs ${plural(minActivities, `steady ${SPORT_ACTIVITY[sport]}`, `steady ${SPORT_PLURAL[sport]}`)} over an hour with ${DRIFT_NEEDS_DEVICE[sport]}.`
}

/** What both halves need when neither has anything: steady efforts over an hour give each, so the line says what to add. */
function bothNeed(sport: Sport): string {
  return `Add ${plural(minActivities, `steady ${SPORT_ACTIVITY[sport]}`, `steady ${SPORT_PLURAL[sport]}`)} over an hour with ${DRIFT_NEEDS_DEVICE[sport]}.`
}

/**
 * What a sport's durability and heart rate drift say. Durability needs minActivities activities at a level; drift
 * needs as many steady efforts. Both read the whole library when the period holds too few (see `lateEvidence`). A
 * half that falls short is left out and its need is said, so the page never shows a figure one activity stands behind.
 */
export function lateInEffort(sport: Sport, evidence: LateEvidence): LateInEffort {
  const durability = durabilityReading(sport, evidence)
  const drift = driftReading(evidence)
  return {
    durability,
    drift,
    needs:
      durability === null && drift === null
        ? [bothNeed(sport)]
        : [
            ...(durability === null ? [durabilityNeed(sport)] : []),
            ...(drift === null ? [driftNeed(sport)] : []),
          ],
  }
}

/**
 * What the section's row says of it: the durability stat and what heart rate drift did, each only when it is there,
 * so a section with one half still tells its finding. Null when neither half has evidence.
 */
export function lateFinding(reading: LateInEffort): string | null {
  const parts = [
    reading.durability === null ? null : `Durability: ${reading.durability.stat}`,
    reading.drift === null
      ? null
      : `Heart rate drift: ${driftFinding(reading.drift.medianPct, reading.drift.allTime)}`,
  ].filter((part) => part !== null)
  return parts.length === 0 ? null : parts.map((part) => `${part}.`).join(' ')
}
