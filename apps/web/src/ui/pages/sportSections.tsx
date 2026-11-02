import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { yearsFinding } from '@rca/core/lookback'
import { LATE_IN_EFFORT_NAME, lateFinding, lateInEffort } from '../lateInEffort'
import { timeInZonesLack } from '../zoneTimeCopy'
import { buildRows } from '../charts/sportCurveModel'
import { bestEffortRows, curvesOf } from './bestEffortRows'
import { BestEffortsEvidence } from './BestEffortsEvidence'
import { bestEffortsFinding } from './bestEffortsFinding'
import { BestEffortsSection } from './BestEffortsSection'
import { LateInEffortSection } from './LateInEffortSection'
import { racePredictionsContent } from './racePredictionsSection'
import { SameHeartRateSection } from './SameHeartRateSection'
import { sameHeartRateLackText } from '../sameHeartRateCopy'
import { SAME_HEART_RATE_NAME, weeklyFinding } from './sameHeartRateLack'
import { SectionCell } from './SectionCell'
import { SectionLine } from './SectionLine'
import { anchorOf } from './sectionAnchor'
import type { SectionNavItem } from './SectionNav'
import { StandOutSection } from './StandOutSection'
import { standOutFinding, standOutFor } from './standOut'
import { TimeInZonesSection } from './TimeInZonesSection'
import { YearsSection } from './YearsSection'
import { BestsOverTimeSection } from './BestsOverTimeSection'
import { SPORT_PLURAL } from '../sports'
import type { SectionContext } from './sportPageProps'

/** The sections that can follow a sport page's answer. */
export type SectionId =
  | 'years'
  | 'bestEfforts'
  | 'racePredictions'
  | 'timeInZones'
  | 'bestsOverTime'
  | 'sameHeartRate'
  | 'lateInEffort'
  | 'standOut'
  | 'evidence'

/**
 * What a section gives the page: its content, or when the library cannot fill it yet, the one line in its place that
 * says what to add (`empty`), and for a section that sits behind a disclosure, the name and the finding its row says.
 * A disclosure starts open; `restated` marks one whose body says its finding already, so the row does not say it twice
 * while open. No section leaves the page in silence. A null content leaves a section out that the sport does not have.
 */
export interface SectionOutcome {
  content: ReactNode | null
  /** Set when `content` is the one line in a section's place: "On this page" does not list it. */
  empty?: true
  closed?: { title: string; finding: string; restated?: true }
}

/** What the page's "On this page" row calls each section. */
const NAV_LABEL: Record<SectionId, string> = {
  years: 'Your years',
  bestEfforts: 'Best efforts',
  racePredictions: 'Race predictions',
  timeInZones: 'Time in zones',
  bestsOverTime: 'Best efforts over time',
  sameHeartRate: 'Same heart rate, week by week',
  lateInEffort: LATE_IN_EFFORT_NAME,
  standOut: 'Best durations',
  evidence: 'All best efforts',
}

/**
 * The rows of each sport's page, in the order they are read. Two sections in a row sit side by side, 60 and 40, on
 * a desktop: what the best efforts predict beside how the time was spread across zones. The answer comes first
 * and these follow, the open sections before the closed ones, which say their finding on their closed row. Your years
 * is the one closed row that comes first, directly after the answer: it is named by its own finding. A sport
 * without race predictions leaves that section out and its zones take the whole row.
 */
export const SPORT_ROWS: Record<Sport, readonly (readonly SectionId[])[]> = {
  run: [
    ['years'],
    ['bestEfforts'],
    ['racePredictions', 'timeInZones'],
    ['bestsOverTime'],
    ['sameHeartRate'],
    ['lateInEffort'],
    ['standOut'],
    ['evidence'],
  ],
  ride: [
    ['years'],
    ['bestEfforts'],
    ['timeInZones'],
    ['bestsOverTime'],
    ['sameHeartRate'],
    ['lateInEffort'],
    ['standOut'],
    ['evidence'],
  ],
}

/** Each sport's section ids in reading order. */
export const SPORT_SECTIONS: Record<Sport, readonly SectionId[]> = {
  run: SPORT_ROWS.run.flat(),
  ride: SPORT_ROWS.ride.flat(),
}

type Context = SectionContext & { list: ReturnType<typeof bestEffortRows> }

/** A section the library cannot fill yet, as its name and the one line that says what to add. */
function emptyOf({ sport }: Context, id: SectionId, line: string): SectionOutcome {
  return {
    content: <SectionLine sport={sport} id={id} title={NAV_LABEL[id]} line={line} />,
    empty: true,
  }
}

/** What a sport's years need when its look-back has nothing to tell: a year of its activities. */
const nothingToTell = (sport: Sport) => `Needs a year of ${SPORT_PLURAL[sport]}.`

/** How each section makes its outcome from what the page worked out. */
const SECTIONS: Record<SectionId, (context: Context) => SectionOutcome> = {
  // Named by its own finding; a sport with no years to tell, or no look-back to read, says what it needs.
  years: (context) => {
    const { sport, lookBack, units, fitness } = context
    const finding =
      lookBack === undefined
        ? null
        : yearsFinding(lookBack.sports[sport], fitness?.[sport].state ?? null)
    return lookBack === undefined || finding === null
      ? emptyOf(context, 'years', nothingToTell(sport))
      : {
          content: <YearsSection sport={sport} lookBack={lookBack} units={units} />,
          closed: { title: 'Your years', finding },
        }
  },
  bestEfforts: (context) => ({ content: <BestEffortsSection {...context} /> }),
  racePredictions: (context) => {
    const found = racePredictionsContent(context)
    if (found.content !== null) return { content: found.content }
    return found.need === undefined
      ? { content: null }
      : emptyOf(context, 'racePredictions', found.need)
  },
  timeInZones: (context) => {
    const { sport, zoneTimes = [], previousZoneTimes = null, previousLabel } = context
    const { zoneWindow, rangeDays } = context
    // Over all time, the widest window there is, whatever the library holds is described.
    const relaxed = zoneWindow === 'all' || rangeDays === null
    const lack = timeInZonesLack(sport, zoneTimes, relaxed)
    return lack === null
      ? {
          content: (
            <TimeInZonesSection
              sport={sport}
              rows={zoneTimes}
              previous={previousZoneTimes}
              previousLabel={previousLabel}
              zoneWindow={zoneWindow}
              relaxed={relaxed}
            />
          ),
        }
      : emptyOf(context, 'timeInZones', lack)
  },
  bestsOverTime: ({
    sport,
    result,
    previous,
    previousLabel,
    change,
    trends,
    dotsWithheld,
    massKg,
    units,
  }) => {
    const { current, earlier } = curvesOf({ sport, result, previous, previousLabel })
    return {
      content: (
        <BestsOverTimeSection
          sport={sport}
          trends={trends}
          withheld={dotsWithheld}
          massKg={massKg}
          units={units}
          finding={
            earlier === null || previousLabel === null
              ? null
              : {
                  sport,
                  units,
                  rows: buildRows(sport, current, earlier),
                  previousLabel,
                  change,
                }
          }
        />
      ),
    }
  },
  sameHeartRate: (context) => {
    const { sport, sameHeartRate, units, fitness } = context
    const lack = sameHeartRateLackText(sport, sameHeartRate)
    if (lack !== null) return emptyOf(context, 'sameHeartRate', lack)
    // No change is claimed from the weekly dots. With a fitness status on the page it is the sport's voice, and the
    // row says so.
    const statusSpeaks = fitness !== undefined && fitness[sport].state !== 'not-enough-evidence'
    return {
      content: <SameHeartRateSection sport={sport} data={sameHeartRate} units={units} />,
      closed: {
        title: SAME_HEART_RATE_NAME,
        finding: weeklyFinding(sport, sameHeartRate.referenceHeartRate, statusSpeaks),
        restated: true,
      },
    }
  },
  // The section holds two readings, each with its own need. A half the library cannot give says its need under the
  // other; with neither, the section is the one line that says what to add.
  lateInEffort: (context) => {
    const { sport, result, lateEvidence, units } = context
    const reading = lateInEffort(sport, lateEvidence)
    const finding = lateFinding(reading)
    return finding === null
      ? emptyOf(context, 'lateInEffort', reading.needs.join(' '))
      : {
          content: (
            <LateInEffortSection
              sport={sport}
              reading={reading}
              activities={result.activities}
              units={units}
            />
          ),
          closed: { title: LATE_IN_EFFORT_NAME, finding, restated: true },
        }
  },
  standOut: (context) => {
    const { sport, result, libraryBests, library, inLibrary } = context
    const answer = standOutFor(result, sport, libraryBests ?? null, library, inLibrary)
    return 'lack' in answer
      ? emptyOf(context, 'standOut', answer.lack)
      : {
          content: <StandOutSection sport={sport} profile={answer.profile} />,
          closed: {
            title: NAV_LABEL.standOut,
            finding: standOutFinding(answer.profile, answer.allTime),
          },
        }
  },
  evidence: ({ list }) => ({
    content: <BestEffortsEvidence list={list} />,
    closed: { title: 'All best efforts', finding: bestEffortsFinding(list) },
  }),
}

/** A row of a sport page: its cells, which sit side by side when there are two. */
export interface PlacedRow {
  key: string
  cells: { id: SectionId; node: ReactNode }[]
}

/**
 * A sport's page below its answer: the rows that have something to show, in a section's own place whether it holds its
 * answer or the one line that says what to add, and the "On this page" items for the sections that hold an answer.
 */
export function layoutOf(
  sport: Sport,
  context: SectionContext,
): { rows: PlacedRow[]; nav: SectionNavItem[] } {
  const full: Context = { ...context, list: bestEffortRows(context) }
  const outcomes = new Map(SPORT_SECTIONS[sport].map((id) => [id, SECTIONS[id](full)] as const))
  const rows = SPORT_ROWS[sport].flatMap((ids) => {
    const cells = ids.flatMap((id) => {
      const outcome = outcomes.get(id)
      return outcome?.content
        ? [{ id, node: <SectionCell sport={sport} id={id} outcome={outcome} /> }]
        : []
    })
    return cells.length === 0 ? [] : [{ key: ids.join('-'), cells }]
  })
  return {
    rows,
    nav: rows.flatMap((row) =>
      row.cells
        .filter(({ id }) => outcomes.get(id)?.empty !== true)
        .map(({ id }) => ({ id: anchorOf(sport, id), label: NAV_LABEL[id] })),
    ),
  }
}
