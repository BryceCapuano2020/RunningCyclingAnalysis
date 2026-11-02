import { WEEK_ORIGIN_MS } from '../calendar'
import { DAY_MS } from '../constants'
import { sameSet } from '../digestMemo'
import { fitnessHistories } from '../fitness/compute'
import type { FitnessHistory } from '../fitness/compute'
import { hindsightsOf } from '../lookback/compute'
import type { EpisodeKind, SportYears } from '../lookback/types'
import { quantileSorted } from '../math'
import type { ActivityDigest, Sport } from '../types'
import { perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'

/** What a step of a dot's value is, in the sport's own unit: m/s for a run (a pace is read from it), watts for a ride. */
const STEP: Record<Sport, number> = { run: 0.01, ride: 1 }

/** The middle line is read every 4 weeks, over the 6 weeks either side of it, and only where 4 activities fall in them. */
const LINE_STEP_DAYS = 28
const LINE_HALF_DAYS = 42
const LINE_MIN = 4

/** A slip or a rise the look-back lists, as the weeks it spans on the day clock the dots are on. */
export interface DotsSpan {
  kind: 'slip' | 'rise'
  fromDay: number
  /** The day the next change began; null while it lasts (to `horizonDay`). */
  toDay: number | null
}

/** A calendar year's steady activities: how many, their middle and the middle 80% of them, in `step`s. All zero for a year with none. */
export interface DotsYear {
  year: number
  n: number
  median: number
  low: number
  high: number
}

/**
 * One sport's steady activities over the whole library, as the fitness card reads them: one dot for each, its
 * output at the card's heart rate. Compact arrays, so 2,000 dots post in about 14 KB.
 */
export interface FitnessDots {
  /** The heart rate (bpm) the dots are read at: the fitness card's. Null without a steady activity. */
  referenceHr: number | null
  /** What a value below is worth in the sport's own unit (m/s for a run, W for a ride). */
  step: number
  /** The day (on the look-back's clock: whole days from its Monday origin) of the first dot, and the days from each dot to the next. */
  firstDay: number
  gaps: number[]
  /** Each dot's output at the reference heart rate, in steps, in time order. */
  levels: number[]
  /** The middle of the dots every 28 days from `firstDay`, in steps; null where fewer than 4 dots lie within 6 weeks of it. */
  line: (number | null)[]
  years: DotsYear[]
  spans: DotsSpan[]
  /** The look-back's horizon day, where an open slip ends; null when it tells nothing of the sport. */
  horizonDay: number | null
}

const NO_DOTS: FitnessDots = {
  referenceHr: null,
  step: 0,
  firstDay: 0,
  gaps: [],
  levels: [],
  line: [],
  years: [],
  spans: [],
  horizonDay: null,
}

/** The look-back's episodes this chart shades: a slip however it ended, and a rise. */
const SPAN_KIND: Partial<Record<EpisodeKind, DotsSpan['kind']>> = {
  'slip-back': 'slip',
  'slip-partly-back': 'slip',
  'slip-open': 'slip',
  improvement: 'rise',
}

const dayOfMs = (ms: number): number => Math.round((ms - WEEK_ORIGIN_MS) / DAY_MS)
const yearOfDay = (day: number): number => new Date(WEEK_ORIGIN_MS + day * DAY_MS).getUTCFullYear()

/** The middle of values sorted ascending. */
const middle = (sorted: readonly number[]) => quantileSorted(sorted, 0.5)

/** The values of the dots within `LINE_HALF_DAYS` of each 28th day from the first, null where too few. */
function middleLine(days: readonly number[], values: readonly number[]): (number | null)[] {
  const line: (number | null)[] = []
  let from = 0
  let to = 0
  for (let at = days[0]!; at <= days[days.length - 1]!; at += LINE_STEP_DAYS) {
    while (days[from]! < at - LINE_HALF_DAYS) from++
    while (to < days.length && days[to]! <= at + LINE_HALF_DAYS) to++
    line.push(to - from < LINE_MIN ? null : middle(values.slice(from, to).sort((a, b) => a - b)))
  }
  return line
}

/** Each calendar year from the first dot's to the last's, a year with none between them all zeros. */
function yearsOf(days: readonly number[], values: readonly number[], step: number): DotsYear[] {
  const byYear = new Map<number, number[]>()
  days.forEach((day, i) => {
    const year = yearOfDay(day)
    const own = byYear.get(year)
    if (own === undefined) byYear.set(year, [values[i]!])
    else own.push(values[i]!)
  })
  const first = yearOfDay(days[0]!)
  const last = yearOfDay(days[days.length - 1]!)
  const steps = (value: number) => Math.round(value / step)
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const year = first + i
    const own = byYear.get(year)?.sort((a, b) => a - b)
    if (own === undefined) return { year, n: 0, median: 0, low: 0, high: 0 }
    return {
      year,
      n: own.length,
      median: steps(middle(own)),
      low: steps(quantileSorted(own, 0.1)),
      high: steps(quantileSorted(own, 0.9)),
    }
  })
}

function spansOf(years: SportYears | undefined): { spans: DotsSpan[]; horizonDay: number | null } {
  if (years === undefined || years.kind !== 'ok') return { spans: [], horizonDay: null }
  return {
    spans: years.episodes.flatMap((e) => {
      const kind = SPAN_KIND[e.kind]
      return kind === undefined
        ? []
        : [{ kind, fromDay: dayOfMs(e.fromMs), toDay: e.toMs === null ? null : dayOfMs(e.toMs) }]
    }),
    horizonDay: dayOfMs(years.toMs),
  }
}

/** One sport's dots from the steady runs the fitness card reads and the look-back's episodes. */
function dotsOf(sport: Sport, history: FitnessHistory, years: SportYears | undefined): FitnessDots {
  const { runs } = history
  if (runs.length === 0) return NO_DOTS
  const step = STEP[sport]
  const days = runs.map((r) => Math.floor(r.t))
  const values = runs.map((r) => Math.exp(r.x))
  return {
    referenceHr: history.referenceHr,
    step,
    firstDay: days[0]!,
    gaps: days.map((day, i) => (i === 0 ? 0 : day - days[i - 1]!)),
    levels: values.map((value) => Math.round(value / step)),
    line: middleLine(days, values).map((v) => (v === null ? null : Math.round(v / step))),
    years: yearsOf(days, values, step),
    ...spansOf(years),
  }
}

/**
 * Fitness over the years: for each sport, the steady runs or rides the fitness card reads (one dot for each, at the
 * card's heart rate), a rolling middle, a summary of each year, and the slips and rises the look-back lists. It reads
 * the card's own memory of the runs and the look-back's of its episodes, so the three are one story: the same dots,
 * the same heart rate, the same episodes.
 */
function build(digests: ActivityDigest[], input: HistoryInput): Record<Sport, FitnessDots> {
  const histories = fitnessHistories(digests, input.setAside)
  const years = hindsightsOf(digests, input.setAside)
  return perSport((sport) => dotsOf(sport, histories[sport], years?.[sport]))
}

export const fitness: HistoryPart<Record<Sport, FitnessDots>> = {
  empty: perSport(() => NO_DOTS),
  build,
  same: (a, b) => sameSet(a.setAside, b.setAside),
}
