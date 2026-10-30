import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { sameHeartRateCopy } from '../sameHeartRateCopy'
import { LATE_IN_EFFORT_NAME, lateFinding, lateInEffort } from '../lateInEffort'
import { RACE_PREDICTIONS_NAME, racePredictionNeed, racePredictionsOf } from '../racePredictions'
import { distanceRecords } from '../records'
import { timeInZonesLack } from '../zoneTimeCopy'
import { bestEffortRows } from './bestEffortRows'
import { BestEffortsEvidence } from './BestEffortsEvidence'
import { bestEffortsFinding } from './bestEffortsFinding'
import { BestEffortsSection } from './BestEffortsSection'
import { LateInEffortSection } from './LateInEffortSection'
import { RacePredictions } from './RacePredictions'
import { ranBests } from './raceRan'
import { SameHeartRateSection } from './SameHeartRateSection'
import {
  SAME_HEART_RATE_NAME,
  SAME_HEART_RATE_WEEKLY_NAME,
  sameHeartRateLack,
  weeklyFinding,
} from './sameHeartRateLack'
import { SectionCell } from './SectionCell'
import { anchorOf } from './sectionAnchor'
import type { SectionNavItem } from './SectionNav'
import { StandOutSection } from './StandOutSection'
import { standOutFinding, standOutOf } from './standOut'
import { standOutLack } from './standOutLack'
import { TimeInZonesSection } from './TimeInZonesSection'
import { WeekByWeekSection } from './WeekByWeekSection'
import { lackLine } from './lackLine'
import type { SectionContext } from './sportPageProps'

/** The sections that can follow a sport page's answer. */
export type SectionId =
  | 'bestEfforts'
  | 'racePredictions'
  | 'timeInZones'
  | 'weekByWeek'
  | 'sameHeartRate'
  | 'lateInEffort'
  | 'standOut'
  | 'evidence'

/**
 * What a section gives the page: its content, why part of it or all of it is missing in plain words, and for a
 * section that sits behind a disclosure, the name and the finding its closed row says. A section with nothing to
 * show has no content and so no heading, and the page gathers its lack with the others' in one "Not enough yet"
 * list at the end.
 */
export interface SectionOutcome {
  content: ReactNode | null
  /** Why part of the section or all of it is missing, a line for each part, in plain words. */
  lacks: readonly string[]
  closed?: { title: string; finding: string }
}

/** What the page's "On this page" row calls each section. */
const NAV_LABEL: Record<SectionId, string> = {
  bestEfforts: 'Best efforts',
  racePredictions: 'Race predictions',
  timeInZones: 'Time in zones',
  weekByWeek: 'Week by week',
  sameHeartRate: 'Same heart rate',
  lateInEffort: 'Late in long sessions',
  standOut: 'Stand-out',
  evidence: 'All best efforts',
}

/**
 * The rows of each sport's page, in the order they are read. Two sections in a row sit side by side, 60 and 40, on
 * a desktop: what the best efforts predict beside how the time was spread across zones. The answer comes first
 * and these follow, the open sections before the closed ones, which say their finding on their closed row. A sport
 * without race predictions leaves that section out and its zones take the whole row.
 */
export const SPORT_ROWS: Record<Sport, readonly (readonly SectionId[])[]> = {
  run: [
    ['bestEfforts'],
    ['racePredictions', 'timeInZones'],
    ['weekByWeek'],
    ['sameHeartRate'],
    ['lateInEffort'],
    ['standOut'],
    ['evidence'],
  ],
  ride: [
    ['bestEfforts'],
    ['timeInZones'],
    ['weekByWeek'],
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

/** How each section makes its outcome from what the page worked out. */
const SECTIONS: Record<SectionId, (context: Context) => SectionOutcome> = {
  bestEfforts: (context) => ({ content: <BestEffortsSection {...context} />, lacks: [] }),
  racePredictions: ({ sport, result, units, rangeDays, openedAt }) => {
    const found = racePredictionsOf(sport, result)
    const need = racePredictionNeed(sport, result)
    if (found !== null) {
      return {
        content: (
          <RacePredictions
            sport={sport}
            found={found}
            units={units}
            allTime={rangeDays === null}
            ran={ranBests(found, distanceRecords(result.activities, units).records, openedAt)}
          />
        ),
        lacks: [],
      }
    }
    return {
      content: null,
      lacks: need === undefined ? [] : [lackLine(RACE_PREDICTIONS_NAME, need)],
    }
  },
  timeInZones: ({ sport, zoneTimes = [], previousZoneTimes = null, previousLabel }) => {
    const lack = timeInZonesLack(sport, zoneTimes)
    return lack === null
      ? {
          content: (
            <TimeInZonesSection
              sport={sport}
              rows={zoneTimes}
              previous={previousZoneTimes}
              previousLabel={previousLabel}
            />
          ),
          lacks: [],
        }
      : { content: null, lacks: [lack] }
  },
  weekByWeek: ({ sport, trends, windowDays, massKg, units }) => ({
    content: (
      <WeekByWeekSection
        sport={sport}
        trends={trends}
        windowDays={windowDays}
        massKg={massKg}
        units={units}
      />
    ),
    lacks: [],
  }),
  sameHeartRate: ({ sport, sameHeartRate, units, fitness }) => {
    const lack = sameHeartRateLack(sport, sameHeartRate, units)
    if (lack !== null) return { content: null, lacks: [lack] }
    // With a fitness status on the page the weekly view defers to it: it is retitled and says no change of its own, so
    // the card and this section never disagree about the same runs.
    const deferred = fitness !== undefined && fitness[sport].state !== 'not-enough-evidence'
    return {
      content: (
        <SameHeartRateSection sport={sport} data={sameHeartRate} units={units} weekly={deferred} />
      ),
      lacks: [],
      closed: deferred
        ? {
            title: SAME_HEART_RATE_WEEKLY_NAME,
            finding: weeklyFinding(sport, sameHeartRate.referenceHeartRate),
          }
        : {
            title: SAME_HEART_RATE_NAME,
            // The closed row says what the chart is titled by, so the two cannot differ, and which heart rate "the
            // same" is, so the finding stands alone.
            finding: `${sameHeartRateCopy(sport, sameHeartRate, units).text.replace(/\.$/, '')} (${sameHeartRate.referenceHeartRate} bpm)`,
          },
    }
  },
  // The section holds two readings, each with its own need: the page lists what is missing even beside content.
  lateInEffort: ({ sport, result, lateEvidence, units }) => {
    const reading = lateInEffort(sport, lateEvidence)
    const { needs } = reading
    const finding = lateFinding(reading)
    return {
      content:
        finding === null ? null : (
          <LateInEffortSection
            sport={sport}
            reading={reading}
            activities={result.activities}
            units={units}
          />
        ),
      lacks: needs.map(({ name, need }) => lackLine(name, need)),
      closed: finding === null ? undefined : { title: LATE_IN_EFFORT_NAME, finding },
    }
  },
  standOut: ({ sport, result }) => {
    const profile = standOutOf(result, sport)
    const lack = standOutLack(sport, result)
    return profile === null
      ? { content: null, lacks: lack === null ? [] : [lack] }
      : {
          content: <StandOutSection sport={sport} profile={profile} />,
          lacks: [],
          closed: { title: 'Where your bests stand out', finding: standOutFinding(profile) },
        }
  },
  evidence: ({ list }) => ({
    content: <BestEffortsEvidence list={list} />,
    lacks: [],
    closed: { title: 'All best efforts', finding: bestEffortsFinding(list) },
  }),
}

/** A row of a sport page: its cells, which sit side by side when there are two. */
export interface PlacedRow {
  key: string
  cells: { id: SectionId; node: ReactNode }[]
}

/**
 * A sport's page below its answer: the rows that have something to show, the "On this page" items for them, and
 * the lacks of the sections that have none, which the page lists once at its end.
 */
export function layoutOf(
  sport: Sport,
  context: SectionContext,
): { rows: PlacedRow[]; nav: SectionNavItem[]; lacks: string[] } {
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
      row.cells.map(({ id }) => ({ id: anchorOf(sport, id), label: NAV_LABEL[id] })),
    ),
    lacks: [...outcomes.values()].flatMap(({ lacks }) => lacks),
  }
}
