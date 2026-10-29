import type { Sport } from '@rca/core/types'
import { plural } from '../components/plural'
import { DAY_MS } from '@rca/core/constants'
import { formatMonth } from '../format/date'
import { wholeGrade } from '../gradeFormat'
import { SPORT_ORDER, SPORT_TITLE } from '../sports'
import type { SharedWeek } from './gradeTrend'
import { findingOf, phraseOf, utcYear, withTail } from './trendFinding'
import type { Phrase, PhraseTools, Reading } from './trendFinding'
import { shortDate, utcDayLocal } from './trendTicks'

export { MIN_CHANGE_FRACTION } from './trendFinding'

type Row = Pick<SharedWeek, 'endMs' | 'run' | 'ride' | 'rideLow' | 'rideHigh'>

/** Whether a sport's value waits for the athlete's weight: a ride's does, since it is graded through W/kg. */
const NEEDS_WEIGHT: Record<Sport, boolean> = { run: false, ride: true }

/** A sport's readings in the rows: its value, and for a ride the range it was stated with. */
const READ: Record<Sport, (row: Row) => Reading | null> = {
  run: (row) =>
    row.run === null ? null : { endMs: row.endMs, raw: row.run, low: null, high: null },
  ride: (row) =>
    row.ride === null
      ? null
      : { endMs: row.endMs, raw: row.ride, low: row.rideLow, high: row.rideHigh },
}

/** A move that reaches back further than this is dated by its month, a shorter one by its day: 26 weeks. */
const MONTH_DATED_AFTER_MS = 26 * 7 * DAY_MS

/** The day a move is measured from: its month, with the year when it is not the latest one's, or the day on a short span. */
export function sinceLabel(ms: number, latestMs: number): string {
  if (latestMs - ms <= MONTH_DATED_AFTER_MS) return `since ${shortDate(ms)}`
  return `since ${formatMonth(utcDayLocal(ms), utcYear(ms) !== utcYear(latestMs))}`
}

/** The size of a move in words: whole grade points, as the end labels show them. */
function amountOf(from: number, to: number): string | null {
  const points = Math.abs(wholeGrade(to) - wholeGrade(from))
  return points === 0 ? null : plural(points, 'point')
}

const TOOLS: PhraseTools = {
  words: {
    better: (amount) => `rose ${amount}`,
    worse: (amount) => `fell ${amount}`,
    highest: 'is the highest on file',
    peak: (amount, year) => `is ${amount} under its ${year} peak`,
    peakAfter: (amount, year) => `${amount} under its ${year} peak`,
    steady: 'has held steady',
  },
  amountOf,
  since: sinceLabel,
}

/** What each sport's trend says about now, for the sports the chart draws, in the order of the sports. */
function phrasesOf(
  rows: readonly Row[],
  options: { rideKnown: boolean },
): { sport: Sport; phrase: Phrase }[] {
  return SPORT_ORDER.filter((sport) => options.rideKnown || !NEEDS_WEIGHT[sport]).flatMap(
    (sport) => {
      const readings = rows.flatMap((row) => READ[sport](row) ?? [])
      const phrase = phraseOf(SPORT_TITLE[sport], findingOf(readings, 1), TOOLS)
      return phrase === null ? [] : [{ sport, phrase }]
    },
  )
}

/**
 * The trend's title, which says what it found about now, in at most two clauses. Each sport is judged over the
 * last year (or the whole span when that is shorter): "Running has held steady; cycling rose 6 points over the
 * last year". A change counts only past MIN_CHANGE_FRACTION and, for an estimated ride, clear of its range. A sport
 * well under a peak older than that year says so: "Running is 3 points under its 2021 peak". One sport has room for a
 * second clause, "; steady over the last year". Null when no sport has a baseline, when the chart keeps its
 * descriptive title.
 */
export function trendTakeaway(
  rows: readonly Row[],
  options: { rideKnown: boolean },
): string | null {
  const phrases = phrasesOf(rows, options)
  const [only] = phrases
  if (only === undefined) return null
  if (phrases.length === 1) {
    const { lead, follow } = only.phrase
    return [withTail(lead), ...(follow === null ? [] : [follow])].join('; ')
  }
  const leads = phrases.map(({ phrase }) => phrase.lead)
  const tails = new Set(leads.map((lead) => lead.tail))
  const [tail] = tails
  const steady = leads.every((lead) => lead.text.endsWith('has held steady'))
  // Both sports dated alike are dated once, at the end of the sentence.
  if (tails.size === 1 && tail !== null && tail !== undefined) {
    if (steady) {
      return `${SPORT_TITLE[phrases[0]!.sport]} and ${SPORT_TITLE[phrases[1]!.sport].toLowerCase()} have held steady ${tail}`
    }
    return `${leads.map((lead, i) => (i === 0 ? lead.text : lowerFirst(lead.text))).join('; ')} ${tail}`
  }
  return leads.map((lead, i) => (i === 0 ? withTail(lead) : lowerFirst(withTail(lead)))).join('; ')
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
