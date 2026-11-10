import type { AthleteSettings } from '@rca/core/athlete'
import type { AgeProfile } from '@rca/core/grade'
import {
  buildLiftState,
  exerciseKeyOf,
  gradedLiftOf,
  liftChange,
  liftGrade,
  liftHistory,
  liftWindowCounts,
  WINDOW_DAYS,
} from '@rca/core/lift'
import type {
  LiftBest,
  LiftChange,
  LiftEstimate,
  LiftGrade,
  LiftHistoryPoint,
  LiftSet,
  LiftSummary,
  LiftWeek,
} from '@rca/core/lift'
import { formatLoad } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { Property } from '../components/property'
import { plural } from '../components/plural'
import { formatDayMonth } from '../format/date'
import { dayNoonMs, shiftDay } from './liftDay'
import { liftName } from './liftNames'

/** The weeks of the estimate's window, which the change and the counts read. */
export const WINDOW_WEEKS = WINDOW_DAYS / 7

/** The weeks the weekly load shows, the newest last. */
export const LOAD_WEEKS = 12

/** One lift with an estimate, ready to draw: its name, its history and its detail rows. */
export interface LiftEntry {
  id: string
  /** "Back squat, barbell". */
  title: string
  summary: LiftSummary
  estimate: LiftEstimate
  history: LiftHistoryPoint[]
  /** e1RM and range, floor, times body mass, last session, sets and effort. */
  rows: Property[]
  /** The heaviest working set at each rep count, as rows. */
  bests: Property[]
}

/** The lead row: the top lift's figures. */
export interface LiftLead {
  title: string
  estimate: LiftEstimate
  floor: LiftBest
  /** The floor's date as the page names a day. */
  floorDate: string
  /** Core's word for the change on the previous 8 weeks; null when a period has no estimate. */
  change: LiftChange | null
  /** The age grade, for the big three: a grade, or the reason it has none; null for any other lift. */
  grade: LiftGrade | null
}

export interface LiftOverview {
  lead: LiftLead | null
  entries: LiftEntry[]
  /** The last LOAD_WEEKS weeks to the newest with a working set, a week with none included as zeros. */
  weeks: LiftWeek[]
}

/** A load as its number and its unit, from the one formatter every surface uses. */
export function loadParts(kg: number, units: UnitSystem): { number: string; unit: string } {
  const text = formatLoad(kg, units)
  const at = text.lastIndexOf(' ')
  return { number: text.slice(0, at), unit: text.slice(at + 1) }
}

/** A range with the unit once: "270 to 330 lb". */
export function rangeText(low: number, high: number, units: UnitSystem): string {
  const [a, b] = [loadParts(low, units), loadParts(high, units)]
  return `${a.number} to ${b.number} ${b.unit}`
}

/** A set's date as the Lift page names a day, such as "3 Jun". */
function dateText(date: string, today: string): string {
  const ms = dayNoonMs(date)
  return ms === null ? date : formatDayMonth(ms, dayNoonMs(today) ?? ms)
}

const bestText = (best: LiftBest, units: UnitSystem, today: string) =>
  `${formatLoad(best.loadKg, units)} × ${best.reps} · ${dateText(best.date, today)}`

/** A lift's name with its equipment, as the logger's day view heads it: "Back squat, barbell". */
const titleOf = (summary: LiftSummary) => `${liftName(summary.exercise)}, ${summary.equipment}`

function rowsOf(
  summary: LiftSummary,
  estimate: LiftEstimate,
  sets: readonly LiftSet[],
  units: UnitSystem,
  today: string,
): Property[] {
  const counts = liftWindowCounts(sets, today)
  const ratio = summary.relative?.ratio
  return [
    {
      label: 'One-rep max',
      value: `${formatLoad(estimate.point, units)}, ${rangeText(estimate.low, estimate.high, units)}`,
    },
    { label: 'Floor', value: bestText(estimate.floor, units, today) },
    ...(ratio === undefined
      ? []
      : [
          {
            label: 'Times body mass',
            value: `${ratio.point.toFixed(2)}, ${ratio.low.toFixed(2)} to ${ratio.high.toFixed(2)}`,
          },
        ]),
    { label: 'Last session', value: dateText(summary.lastDate, today) },
    { label: `Sets in the last ${WINDOW_WEEKS} weeks`, value: String(counts.sets) },
    ...(counts.sessions === 0
      ? []
      : [
          {
            label: 'Effort',
            value: `RPE on ${counts.ratedSessions} of ${plural(counts.sessions, 'session')}`,
          },
        ]),
  ]
}

/** The weeks of the load, the last LOAD_WEEKS to the newest, with an empty week where none was lifted. */
function filledWeeks(weeks: readonly LiftWeek[]): LiftWeek[] {
  const last = weeks.at(-1)
  if (last === undefined) return []
  const empty = (weekStart: string): LiftWeek => {
    const none = {
      workingSets: 0,
      hardSets: 0,
      effortUnknownSets: 0,
      volumeKg: 0,
      bodyweightSets: 0,
    }
    return { weekStart, regions: { lower: none, upper: none, other: none } }
  }
  const byStart = new Map(weeks.map((week) => [week.weekStart, week]))
  return Array.from({ length: LOAD_WEEKS }, (_, i) => {
    const start = shiftDay(last.weekStart, -7 * (LOAD_WEEKS - 1 - i))
    return byStart.get(start) ?? empty(start)
  })
}

/**
 * What the Lift page leads with, from the log's sets: core's state (one summary per lift, the weekly load), each
 * estimated lift's history, and the top lift: the most recently trained one with an estimate. Every figure is core's.
 */
export function liftOverviewOf(
  sets: readonly LiftSet[],
  settings: AthleteSettings,
  profile: AgeProfile | null,
  units: UnitSystem,
  today: string,
): LiftOverview {
  const state = buildLiftState(sets, settings)
  const entries = state.lifts.flatMap((summary): LiftEntry[] => {
    if (summary.estimate === null) return []
    const own = sets.filter((s) => exerciseKeyOf(s) === summary.key)
    return [
      {
        id: summary.key,
        title: titleOf(summary),
        summary,
        estimate: summary.estimate,
        history: liftHistory(own),
        rows: rowsOf(summary, summary.estimate, own, units, today),
        bests: summary.repBests.map((best) => ({
          label: plural(best.reps, 'rep'),
          value: bestText(best, units, today),
        })),
      },
    ]
  })
  const top = entries[0]
  let lead: LiftLead | null = null
  if (top) {
    const own = sets.filter((s) => exerciseKeyOf(s) === top.summary.key)
    const graded = gradedLiftOf(top.summary.exercise, top.summary.equipment)
    lead = {
      title: top.title,
      estimate: top.estimate,
      floor: top.estimate.floor,
      floorDate: dateText(top.estimate.floor.date, today),
      change: liftChange(own, top.estimate.date, WINDOW_DAYS),
      grade:
        graded === null
          ? null
          : liftGrade({ lift: graded, estimate: top.estimate }, profile, settings.massKg),
    }
  }
  return { lead, entries, weeks: filledWeeks(state.weeks) }
}
