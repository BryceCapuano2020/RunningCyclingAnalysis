import { DAY_MS } from '@rca/core/constants'

/**
 * How far a value must move, as a fraction of where it started, to count as a change. Below it the difference
 * is what one week's best effort moves by without any change in the athlete, so a title says "steady". A value
 * with a range, as an estimated ride has, must also leave that range.
 */
export const MIN_CHANGE_FRACTION = 0.03

/** The look back a title judges the present by: a year. */
export const RECENT_DAYS = 365
/** The least a comparison may reach back to be called "over the last year": about ten months. */
export const YEAR_BASELINE_DAYS = 300
/**
 * The least evidence a finding needs: a span of 12 weeks, and six readings in it. A shorter or thinner series
 * can swing by a week's effort alone, so it is described and not judged.
 */
export const MIN_SPAN_DAYS = 12 * 7
export const MIN_READINGS = 6

/** One reading of a sport's trend: its date, its number, and the range it was stated with (none for a recorded value). */
export interface Reading {
  endMs: number
  /** The sport's own number, whichever way is better. */
  raw: number
  low: number | null
  high: number | null
}

/** Which way is better: +1 where a higher number is, -1 where a lower one is, as a pace in seconds is. */
export type Better = 1 | -1

/** What a trend did: the move to now, and how far now is under its best. */
export interface Finding {
  /** From a year before the latest reading to it, or from the first reading when the span is shorter. Null with no baseline. */
  recent: {
    kind: 'better' | 'worse' | 'steady'
    from: Reading
    to: Reading
    /**
     * True when the comparison reaches back under YEAR_BASELINE_DAYS, so a title names its real start ("since May");
     * false when it reaches back far enough to be called "over the last year".
     */
    namesStart: boolean
  } | null
  /** The best reading, when it is older than the last year and the latest is clear of it, and the latest. */
  peak: { best: Reading; latest: Reading } | null
  /** Whether the latest reading is the best of the series, clear of the previous best: with no move to say, it is the finding. */
  highest: boolean
}

/**
 * Whether the two readings differ by more than their stated ranges allow: by MIN_CHANGE_FRACTION of the first
 * and, where both carry a range, by clear of each other, so two estimates whose ranges overlap are not told apart.
 */
export function exceedsRange(from: Reading, to: Reading): boolean {
  if (Math.abs(to.raw - from.raw) < MIN_CHANGE_FRACTION * Math.abs(from.raw)) return false
  const known = from.low !== null && from.high !== null && to.low !== null && to.high !== null
  if (!known) return true
  return to.low! > from.high! || to.high! < from.low!
}

const NOTHING: Finding = { recent: null, peak: null, highest: false }

/**
 * What a series of readings, oldest first, says about now. Each reading is a week, so the latest is compared with weeks and
 * never with a month's average. It needs MIN_SPAN_DAYS and MIN_READINGS, else it says nothing. The move is judged from
 * the first reading in the last year to the latest, or from the first reading of a shorter series, and is steady unless it
 * exceeds the range or the minimum; it is "over the last year" only if it reaches back YEAR_BASELINE_DAYS, else it names
 * its real start. The peak is the best reading, reported only when it is older than that year and the latest is clear of
 * it, and worse. Null parts where the series is too short to say.
 */
export function findingOf(readings: readonly Reading[], better: Better): Finding {
  const first = readings[0]
  const latest = readings.at(-1)
  if (first === undefined || latest === undefined) return NOTHING
  if (readings.length < MIN_READINGS || latest.endMs - first.endMs < MIN_SPAN_DAYS * DAY_MS) {
    return NOTHING
  }
  const windowStart = latest.endMs - RECENT_DAYS * DAY_MS
  const longSpan = first.endMs < windowStart
  const from = longSpan ? readings.find((reading) => reading.endMs >= windowStart) : first
  const reach = from === undefined ? 0 : (latest.endMs - from.endMs) / DAY_MS
  const inRange = readings.filter((r) => from !== undefined && r.endMs >= from.endMs).length
  const recent =
    from === undefined || from === latest || reach < MIN_SPAN_DAYS || inRange < MIN_READINGS
      ? null
      : {
          kind: !exceedsRange(from, latest)
            ? ('steady' as const)
            : (latest.raw - from.raw) * better > 0
              ? ('better' as const)
              : ('worse' as const),
          from,
          to: latest,
          namesStart: reach < YEAR_BASELINE_DAYS,
        }
  const best = readings.reduce((top, reading) =>
    reading.raw * better > top.raw * better ? reading : top,
  )
  const peak =
    longSpan &&
    best.endMs < windowStart &&
    (latest.raw - best.raw) * better < 0 &&
    exceedsRange(best, latest)
      ? { best, latest }
      : null
  return { recent, peak, highest: isHighest(readings, latest, better) }
}

/**
 * Whether the latest reading is the best on file. A value as recorded must beat the best earlier one by
 * MIN_CHANGE_FRACTION of it, since a flat series, or a best that only a week's effort exceeds, is not at a high. An
 * estimate must be clear of the best earlier value by its range: its low end (its high end, where lower is better)
 * beyond that best, not merely its middle, and the middle by the same minimum.
 */
function isHighest(readings: readonly Reading[], latest: Reading, better: Better): boolean {
  const best = readings
    .slice(0, -1)
    .reduce((top, r) => (r.raw * better > top.raw * better ? r : top))
  if ((latest.raw - best.raw) * better < MIN_CHANGE_FRACTION * Math.abs(best.raw)) return false
  if (latest.low === null || latest.high === null) return true
  return better > 0 ? latest.low > best.raw : latest.high < best.raw
}

/** The UTC year of an instant, which dates a week by the Sunday it ends on, as every date a trend names is. */
export function utcYear(ms: number): number {
  return new Date(ms).getUTCFullYear()
}

/** The words of a measure's rise, fall and peak: each returns a fragment that follows a subject, such as "rose 6 points". */
export interface Words {
  better: (amount: string) => string
  worse: (amount: string) => string
  /** How far latest is under its best, such as "is 3 points under its 2021 peak". */
  peak: (amount: string, year: number) => string
  /** The latest reading is the best on file: "is the highest on file", or for a pace "is the fastest on file". */
  highest: string
  /** The same as a second clause, which has no subject to carry the verb: "3 points under its 2021 peak". */
  peakAfter: (amount: string, year: number) => string
  steady: string
}

/** A sentence's first clause, led by its subject, with the tail that dates it, and the clause that may follow it. */
export interface Phrase {
  /** The clause with its subject: "Running is 3 points under its 2021 peak". */
  lead: { text: string; tail: string | null }
  /** A second clause with no subject, for a chart that tells one sport, or null. */
  follow: string | null
}

export interface PhraseTools {
  words: Words
  /** The size of a move in words, or null where it rounds to nothing, which is steady. */
  amountOf: (from: number, to: number) => string | null
  /** Where a move is measured from: "since May", used when the comparison is a span shorter than a year. */
  since: (ms: number, latestMs: number) => string
}

const LAST_YEAR = 'over the last year'

/**
 * The clauses that tell a finding of one subject: the move to now, or where now stands under the peak when
 * the move is steady, and then the other as a second clause. Null when the finding has neither.
 */
export function phraseOf(subject: string, finding: Finding, tools: PhraseTools): Phrase | null {
  const { words, amountOf, since } = tools
  const { recent, peak } = finding
  const tail =
    recent === null
      ? null
      : recent.namesStart
        ? since(recent.from.endMs, recent.to.endMs)
        : LAST_YEAR
  const amount = recent === null ? null : amountOf(recent.from.raw, recent.to.raw)
  const moved = recent !== null && recent.kind !== 'steady' && amount !== null
  const recentFragment =
    recent === null
      ? null
      : moved
        ? recent.kind === 'better'
          ? words.better(amount)
          : words.worse(amount)
        : words.steady
  const peakAmount = peak === null ? null : amountOf(peak.best.raw, peak.latest.raw)
  const peakYear = peak === null ? 0 : utcYear(peak.best.endMs)
  const peakFragment = peakAmount === null ? null : words.peak(peakAmount, peakYear)
  const peakAfter = peakAmount === null ? null : words.peakAfter(peakAmount, peakYear)
  if (peakFragment !== null && !moved) {
    return {
      lead: { text: `${subject} ${peakFragment}`, tail: null },
      follow: recentFragment === null ? null : `steady ${tail}`,
    }
  }
  if (recentFragment === null) {
    // Without a year to compare, a latest that is the best of the series is still a finding about now.
    return finding.highest
      ? { lead: { text: `${subject} ${words.highest}`, tail: null }, follow: null }
      : null
  }
  return {
    lead: { text: `${subject} ${recentFragment}`, tail },
    follow: peakAfter,
  }
}

/** Dates a clause that carries a tail, or leaves one without as it is. */
export function withTail(lead: { text: string; tail: string | null }): string {
  return lead.tail === null ? lead.text : `${lead.text} ${lead.tail}`
}
