import type { IntensityRow, IntensityShares } from '@rca/core/history'
import { MIN_ZONE_ACTIVITIES, MIN_ZONE_SECONDS } from '@rca/core/zones'
import type { Sport } from '@rca/core/types'
import { formatCount } from '../format/count'
import { SPORT_ACTIVITY, SPORT_LABEL, SPORT_PLURAL } from '../sports'
import { percentText } from '../zoneTimeCopy'
import type { ChartTableData, TooltipContent } from './chartTypes'

/** The bands of heart-rate time, lowest effort first, which is the order they stack in from the foot of a bar. */
export const BANDS = ['easy', 'moderate', 'hard'] as const
export type Band = (typeof BANDS)[number]

/** A band's name in the key and the tooltip. The table's headings say which zones it covers. */
export const BAND_LABEL: Record<Band, string> = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' }

const BAND_COLUMN: Record<Band, string> = {
  easy: 'Easy (zones 1 and 2)',
  moderate: 'Moderate (zone 3)',
  hard: 'Hard (zones 4 and 5)',
}

/** The hard share a year must lead the next year by, as a share of its time, before it is called the hardest. */
export const MIN_HARD_LEAD = 0.05

const DASH = '—'
const FOR_SPORT: Record<Sport, string> = { run: 'for running', ride: 'for riding' }

/** Whether a year has enough heart-rate time to be compared: the floor the time in zones describes a measure from. */
function hasEnoughTime(shares: IntensityShares): boolean {
  return shares.counted >= MIN_ZONE_ACTIVITIES && shares.seconds >= MIN_ZONE_SECONDS
}

/**
 * The year that was hardest for a sport: the largest share of heart-rate time in zones 4 and 5, when it leads the
 * next year by MIN_HARD_LEAD. Null when fewer than two years have enough time, or the lead is smaller, so a tie for
 * the lead is no finding. Years with equal shares are ranked later year first, for a stable order.
 */
export function hardestYear(years: readonly IntensityRow[], sport: Sport): IntensityRow | null {
  const ranked = years
    .filter((row) => hasEnoughTime(row.sports[sport]))
    .sort((a, b) => b.sports[sport].hard - a.sports[sport].hard || b.year - a.year)
  const [leader, next] = ranked
  if (leader === undefined || next === undefined) return null
  return leader.sports[sport].hard - next.sports[sport].hard >= MIN_HARD_LEAD ? leader : null
}

/** The chart's title: the finding when there is one, otherwise the measure, named for the sport. */
export function intensityTitle(years: readonly IntensityRow[], sport: Sport): string {
  const year = hardestYear(years, sport)
  return year === null
    ? `${SPORT_LABEL[sport]} intensity by year`
    : `${year.year} was your hardest year ${FOR_SPORT[sport]}`
}

/** The table twin: each year's share of its heart-rate time in each band, with the time and the count behind it. */
export function intensityTable(years: readonly IntensityRow[], sport: Sport): ChartTableData {
  return {
    caption: `Heart-rate time by intensity, for ${SPORT_PLURAL[sport]}`,
    columns: [
      'Year',
      ...BANDS.map((band) => BAND_COLUMN[band]),
      'Heart-rate time (h)',
      'Activities counted',
    ],
    rows: years.map((row) => {
      const shares = row.sports[sport]
      const timed = shares.seconds > 0
      return [
        String(row.year),
        ...BANDS.map((band) => (timed ? percentText(shares[band]) : DASH)),
        timed ? (shares.seconds / 3600).toFixed(1) : DASH,
        formatCount(shares.counted),
      ]
    }),
  }
}

/** A year's tooltip: its bands from the top down, then its time and count, or a dash when it has no heart rate. */
export function intensityTooltip(
  years: readonly IntensityRow[],
  sport: Sport,
  index: number,
  x: number,
  y: number,
): TooltipContent | null {
  const row = years[index]
  if (row === undefined) return null
  const shares = row.sports[sport]
  const title = String(row.year)
  if (shares.seconds <= 0) {
    return { x, y, title, rows: [{ label: 'Heart rate', value: DASH, note: 'None to count' }] }
  }
  const noun = shares.counted === 1 ? SPORT_ACTIVITY[sport] : SPORT_PLURAL[sport]
  return {
    x,
    y,
    title,
    rows: [
      ...[...BANDS].reverse().map((band) => ({
        label: BAND_LABEL[band],
        value: percentText(shares[band]),
      })),
      {
        label: 'Heart-rate time',
        value: `${(shares.seconds / 3600).toFixed(1)} h`,
        note: `${formatCount(shares.counted)} ${noun}`,
      },
    ],
  }
}
