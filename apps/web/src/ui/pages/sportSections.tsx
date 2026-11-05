import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { tooShortText, yearsFinding } from '@rca/core/lookback'
import { PROFILE_UNFIT_TEXT, profileNamesAny } from '@rca/core/profile'
import { LATE_IN_EFFORT_NAME, lateFindings, lateInEffort } from '../lateInEffort'
import { timeInZonesLack } from '../zoneTimeCopy'
import { buildRows } from '../charts/sportCurveModel'
import { bestEffortRows, curvesOf } from './bestEffortRows'
import { BestEffortsEvidence } from './BestEffortsEvidence'
import { recordSparks } from './recordSparks'
import { BestEffortsSection } from './BestEffortsSection'
import { LateInEffortSection } from './LateInEffortSection'
import { racePredictionsContent } from './racePredictionsSection'
import { SameHeartRateSection } from './SameHeartRateSection'
import { sameHeartRateLackText, sameHeartRateName, sameHeartRateTitle } from '../sameHeartRateCopy'
import { SectionCell } from './SectionCell'
import { SectionLine } from './SectionLine'
import { StandOutSection } from './StandOutSection'
import { standOutFinding, standOutFor } from './standOut'
import { TimeInZonesSection } from './TimeInZonesSection'
import { BESTS_BY_DAY_NAME, BestsOverTimeSection } from './BestsOverTimeSection'
import { hrefFor } from '../route'
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
 * says what to add, and for a section that sits behind a disclosure, its heading (the finding where it has one) and what
 * else its row says while folded.
 * A disclosure starts open; `restated` marks one whose body says that line already, so the row does not say it twice
 * while open. No section leaves the page in silence. A null content leaves a section out that the sport does not have.
 */
export interface SectionOutcome {
  content: ReactNode | null
  closed?: { title: string; finding?: string; restated?: true }
}

/** What each section is called where it has no finding to head it. */
const SECTION_NAME: Record<SectionId, (sport: Sport) => string> = {
  years: () => 'History',
  bestEfforts: () => 'Best efforts',
  racePredictions: () => 'Race predictions',
  timeInZones: () => 'Time in zones',
  bestsOverTime: () => BESTS_BY_DAY_NAME,
  sameHeartRate: sameHeartRateName,
  lateInEffort: () => LATE_IN_EFFORT_NAME,
  standOut: () => 'Best durations',
  evidence: () => 'All best efforts',
}

/**
 * The rows of each sport's page, in the order they are read. Two sections in a row sit side by side, 60 and 40, on
 * a desktop: what the best efforts predict beside how the time was spread across zones. The answer comes first
 * and these follow, the open sections before the closed ones, which say their finding on their closed row. History
 * is the one row that comes first, directly after the answer: its finding and a link to the History tab, which holds the
 * chart and the episodes. A sport without race predictions leaves that section out and its zones take the whole row.
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
    content: <SectionLine sport={sport} id={id} title={SECTION_NAME[id](sport)} line={line} />,
  }
}

/** What a sport's years need when its look-back has nothing to tell: a year of its activities. */
const nothingToTell = (sport: Sport) => `Needs a year of ${SPORT_PLURAL[sport]}.`

/** How each section makes its outcome from what the page worked out. */
const SECTIONS: Record<SectionId, (context: Context) => SectionOutcome> = {
  // The row says the finding of the sport's years and links to the History tab, which holds the chart and the episodes.
  // A sport with no years to tell, or no look-back to read, says what it needs; one too short for them says so.
  years: (context) => {
    const { sport, lookBack, fitness } = context
    const block = lookBack?.sports[sport]
    if (block === undefined) return emptyOf(context, 'years', nothingToTell(sport))
    if (block.fitness.kind === 'too-short') return emptyOf(context, 'years', tooShortText(sport))
    const finding = yearsFinding(block, fitness?.[sport].state ?? null)
    if (finding === null) return emptyOf(context, 'years', nothingToTell(sport))
    return {
      content: (
        <SectionLine
          sport={sport}
          id="years"
          title={SECTION_NAME.years(sport)}
          line={finding}
          link={{ href: hrefFor({ page: 'history' }), text: 'See History' }}
        />
      ),
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
    const { sport, sameHeartRate, units } = context
    const lack = sameHeartRateLackText(sport, sameHeartRate)
    if (lack !== null) return emptyOf(context, 'sameHeartRate', lack)
    // No change is claimed from the weekly dots: the fitness status is the sport's voice on that. The chart's title
    // heads the section, which does not name itself a second time over it.
    return {
      content: <SameHeartRateSection sport={sport} data={sameHeartRate} units={units} />,
      closed: { title: sameHeartRateTitle(sport, sameHeartRate.referenceHeartRate) },
    }
  },
  // The section holds two readings, each with its own need. A half the library cannot give says its need under the
  // other; with neither, the section is the one line that says what to add. The first half's finding heads the
  // section; the second's is its chart's headline, and the folded row says it too.
  lateInEffort: (context) => {
    const { sport, result, lateEvidence, units } = context
    const reading = lateInEffort(sport, lateEvidence)
    const [heading, ...more] = lateFindings(reading)
    return heading === undefined
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
          closed:
            more.length === 0
              ? { title: heading }
              : { title: heading, finding: more.join(' '), restated: true },
        }
  },
  // A finding that names no duration tells the athlete nothing, so the section is left out; one that names one is the
  // section's heading, as a chart's finding is. A library that cannot be compared yet says what to add.
  standOut: (context) => {
    const { sport, result, libraryBests, library, inLibrary } = context
    const answer = standOutFor(result, sport, libraryBests ?? null, library, inLibrary)
    if ('lack' in answer) {
      return answer.lack === PROFILE_UNFIT_TEXT
        ? { content: null }
        : emptyOf(context, 'standOut', answer.lack)
    }
    if (!profileNamesAny(answer.profile)) return { content: null }
    return {
      content: <StandOutSection sport={sport} profile={answer.profile} />,
      closed: { title: standOutFinding(answer.profile, answer.allTime) },
    }
  },
  evidence: ({ sport, list, trends, massKg }) => ({
    content: (
      <BestEffortsEvidence sport={sport} list={list} sparks={recordSparks(sport, trends, massKg)} />
    ),
    closed: { title: SECTION_NAME.evidence(sport) },
  }),
}

/** A row of a sport page: its cells, which sit side by side when there are two. */
export interface PlacedRow {
  key: string
  cells: { id: SectionId; node: ReactNode }[]
}

/**
 * A sport's page below its answer: the rows that have something to show, in a section's own place whether it holds its
 * answer or the one line that says what to add.
 */
export function layoutOf(sport: Sport, context: SectionContext): PlacedRow[] {
  const full: Context = { ...context, list: bestEffortRows(context) }
  return SPORT_ROWS[sport].flatMap((ids) => {
    const cells = ids.flatMap((id) => {
      const outcome = SECTIONS[id](full)
      return outcome.content
        ? [{ id, node: <SectionCell sport={sport} id={id} outcome={outcome} /> }]
        : []
    })
    return cells.length === 0 ? [] : [{ key: ids.join('-'), cells }]
  })
}
