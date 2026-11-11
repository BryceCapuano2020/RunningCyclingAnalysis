import { WINDOW_DAYS, liftWeekStart } from '@rca/core/lift'
import type {
  LiftBest,
  LiftChange,
  LiftEstimate,
  LiftGrade,
  LiftHistoryPoint,
  LiftResults,
  LiftSummary,
  LiftWeek,
  LiftWindowCounts,
} from '@rca/core/lift'
import { formatLoad, formatMass } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { Property } from '../components/property'
import { plural } from '../components/plural'
import { formatDayMonth } from '../format/date'
import { dayNoonMs, shiftDay } from './liftDay'
import { liftName } from './liftNames'
import type { LevelRangeRow } from '../levelRanges'
import { liftLevelRowsOf } from './liftLevelRows'
import { bigThreeLeadOf } from './bigThreeModel'
import type { BigThreeLeadModel } from './bigThreeModel'

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
  /** Its row in the table of every lift: one-rep max, heaviest set and last session, as written. */
  table: { max: string; heaviest: string; last: string }
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
  /** The big three side by side, which the page leads with in place of `lead` once any of them has an estimate. */
  bigThree: BigThreeLeadModel | null
  /** The big three total that earns each level, for the Levels table; null while age, sex or weight is missing. */
  levels: LevelRangeRow[] | null
  /** Every lift with an estimate: big three first, then the most recent. A lift with one session has no line yet. */
  lifts: LiftEntry[]
  /** The lift the page leads with, which the chart shows first; null with no lift. */
  leadId: string | null
  /** The last LOAD_WEEKS weeks to this one, a week with no working set included as zeros. */
  weeks: LiftWeek[]
}

/** A load as its number and its unit, from the one formatter every surface uses. */
export function loadParts(kg: number, units: UnitSystem): { number: string; unit: string } {
  const text = formatLoad(kg, units)
  const at = text.lastIndexOf(' ')
  return { number: text.slice(0, at), unit: text.slice(at + 1) }
}

/** An estimate in whole units as its number and its unit, the way Balance's Big three row writes it. */
export function massParts(kg: number, units: UnitSystem): { number: string; unit: string } {
  const text = formatMass(kg, units)
  const at = text.lastIndexOf(' ')
  return { number: text.slice(0, at), unit: text.slice(at + 1) }
}

/** An estimate's range in whole units with the unit once: "270 to 330 lb". */
export function rangeText(low: number, high: number, units: UnitSystem): string {
  const [a, b] = [massParts(low, units), massParts(high, units)]
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
  counts: LiftWindowCounts,
  units: UnitSystem,
  today: string,
): Property[] {
  const ratio = summary.relative?.ratio
  return [
    {
      label: 'One-rep max',
      value: `${formatMass(estimate.point, units)}, ${rangeText(estimate.low, estimate.high, units)}`,
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
function filledWeeks(weeks: readonly LiftWeek[], today: string): LiftWeek[] {
  const last = weeks.at(-1)
  if (last === undefined) return []
  // The chart ends at this week, so weeks with no lifting since the last set show as empty rather than being hidden.
  const end = liftWeekStart(today)
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
    const start = shiftDay(end, -7 * (LOAD_WEEKS - 1 - i))
    return byStart.get(start) ?? empty(start)
  })
}

/**
 * What the Lift page leads with, from the lift results (`liftResultsOf`): the state (one summary per lift, the weekly load), each
 * estimated lift's history and window counts, the order, the top lift with its change and grade, the big three and the levels. This
 * file words and lays them out and works out no lift figure of its own.
 */
export function liftOverviewOf(results: LiftResults, units: UnitSystem): LiftOverview {
  const { state, today } = results
  const byKey = new Map(state.lifts.map((summary) => [summary.key, summary]))
  const entries = results.order.flatMap((key): LiftEntry[] => {
    const summary = byKey.get(key)
    const counts = results.windows[key]
    if (summary === undefined || summary.estimate === null || counts === undefined) return []
    return [
      {
        id: key,
        title: titleOf(summary),
        summary,
        estimate: summary.estimate,
        history: results.histories[key] ?? [],
        rows: rowsOf(summary, summary.estimate, counts, units, today),
        table: {
          max: formatMass(summary.estimate.point, units),
          heaviest: `${formatLoad(summary.estimate.floor.loadKg, units)} × ${summary.estimate.floor.reps}`,
          last: dateText(summary.lastDate, today),
        },
        bests: summary.repBests.map((best) => ({
          label: plural(best.reps, 'rep'),
          value: bestText(best, units, today),
        })),
      },
    ]
  })
  const top = entries.find((entry) => entry.id === results.lead?.key)
  const lead: LiftLead | null =
    top === undefined || results.lead === null
      ? null
      : {
          title: top.title,
          estimate: top.estimate,
          floor: top.estimate.floor,
          floorDate: dateText(top.estimate.floor.date, today),
          change: results.lead.change,
          grade: results.lead.grade,
        }
  return {
    lead,
    bigThree: bigThreeLeadOf(results, units),
    levels: liftLevelRowsOf(results, units),
    leadId: top?.id ?? null,
    lifts: entries,
    weeks: filledWeeks(state.weeks, today),
  }
}
