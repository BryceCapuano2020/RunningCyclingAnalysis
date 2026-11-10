import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { tooShortText, yearsFinding } from '@rca/core/lookback'
import { timeInZonesLack } from '../zoneTimeCopy'
import { bestEffortRows } from './bestEffortRows'
import { BestEffortsSection } from './BestEffortsSection'
import { racePredictionsContent } from './racePredictionsSection'
import { SectionCell } from './SectionCell'
import { SectionLine } from './SectionLine'
import { SportHistory } from './SportHistory'
import { TimeInZonesSection } from './TimeInZonesSection'
import { hrefFor } from '../route'
import { SPORT_PLURAL } from '../sports'
import type { SectionContext } from './sportPageProps'

/** The sections that can follow a sport page's answer. */
export type SectionId = 'years' | 'bestEfforts' | 'racePredictions' | 'timeInZones'

/**
 * What a section gives the page: its content, or when the library cannot fill it yet, the one line in its place that
 * says what to add. No section leaves the page in silence. A null content leaves a section out that the sport does not have.
 */
export interface SectionOutcome {
  content: ReactNode | null
}

/** What each section is called where it has no finding to head it. */
const SECTION_NAME: Record<SectionId, (sport: Sport) => string> = {
  years: () => 'History',
  bestEfforts: () => 'Best efforts',
  racePredictions: () => 'Race predictions',
  timeInZones: () => 'Time in zones',
}

/**
 * The rows of each sport's page, in the order they are read. Two sections in a row sit side by side, 60 and 40, on
 * a desktop: what the best efforts predict beside how the time was spread across zones. The answer comes first
 * and these follow. History
 * is the one row that comes first, directly after the answer: its finding and a link to the History tab, which holds the
 * chart. A sport without race predictions leaves that section out and its zones take the whole row.
 */
export const SPORT_ROWS: Record<Sport, readonly (readonly SectionId[])[]> = {
  run: [['years'], ['bestEfforts'], ['racePredictions', 'timeInZones']],
  ride: [['years'], ['bestEfforts'], ['timeInZones']],
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
  // The row says the finding of the sport's years and links to the History tab, which holds the chart.
  // A sport with no years to tell, or no look-back to read, says what it needs; one too short for them says so.
  years: (context) => {
    const { sport, lookBack, fitness, fitnessDots, units } = context
    const block = lookBack?.sports[sport]
    const link = { href: hrefFor({ page: 'history' }), text: 'See History' }
    const dots = fitnessDots?.[sport]
    // A graph needs a dot to draw: with none the row is its sentence, as before.
    const drawn = dots !== undefined && dots.levels.length > 0
    if (block === undefined) return emptyOf(context, 'years', nothingToTell(sport))
    if (block.fitness.kind === 'too-short') {
      const reason = tooShortText(sport)
      if (!drawn) return emptyOf(context, 'years', reason)
      return {
        content: (
          <SportHistory
            sport={sport}
            dots={dots}
            units={units}
            finding={reason}
            reason={reason}
            link={link}
          />
        ),
      }
    }
    const finding = yearsFinding(block, fitness?.[sport].state ?? null)
    if (drawn) {
      return {
        content: (
          <SportHistory
            sport={sport}
            dots={dots}
            units={units}
            {...(finding === null ? {} : { finding })}
            link={link}
          />
        ),
      }
    }
    if (finding === null) return emptyOf(context, 'years', nothingToTell(sport))
    return {
      content: (
        <SectionLine
          sport={sport}
          id="years"
          title={SECTION_NAME.years(sport)}
          line={finding}
          link={link}
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
