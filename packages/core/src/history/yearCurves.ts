import { DURATIONS_S, HEADLINE_DURATION_S, PRIORS } from '../constants'
import { metabolicToFlatSpeed } from '../metabolic'
import { CURVE_START_S } from '../profile'
import { sig } from '../lookback/round'
import type { ActivityDigest, Curve, Sport, SportCurves } from '../types'
import { perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'
import { curvesByYear, pointShownHard, sameHardness, sameRidePricing } from './yearlyCurves'

/** One calendar year's best curve in a sport's own number. */
export interface YearCurve {
  year: number
  /** The best at each of the sport's `durations`: m/s on the flat for a run, watts for a ride; null with no effort that long. */
  values: (number | null)[]
  /** Whether heart rate shows the year's best 20 minutes was hard. False without one. */
  hard: boolean
}

/** A sport's years of best curves, oldest first. A year with no effort the chart can draw is left out. */
export interface SportYearCurves {
  /** The durations the values are at, s, shortest first: from a minute, or where the sport's curve starts, to three hours. */
  durations: number[]
  years: YearCurve[]
}

export type YearCurves = Record<Sport, SportYearCurves>

/** The charts show nothing shorter than a minute (see CURVE_START_S). */
const CHART_START_S = 60

/** The curve a sport reads, and the sport's own number for one of its values. */
const CURVE_OF: Record<Sport, (curves: SportCurves) => Curve> = {
  run: (curves) => curves.runCurve,
  ride: (curves) => curves.rideCurve,
}
/** A run's gross metabolic W/kg is the flat speed that costs the same, kept to five digits; a ride's watts to the watt. */
const NATIVE: Record<Sport, (value: number) => number> = {
  run: (wkg) => sig(metabolicToFlatSpeed(wkg, PRIORS.runEconomyScale.mean)),
  ride: (watts) => Math.round(watts),
}

const durationsOf = (sport: Sport): number[] =>
  DURATIONS_S.filter((durationS) => durationS >= Math.max(CHART_START_S, CURVE_START_S[sport]))

const empty: YearCurves = perSport((sport) => ({ durations: durationsOf(sport), years: [] }))

function build(digests: ActivityDigest[], input: HistoryInput): YearCurves {
  const years = curvesByYear(digests, input)
  return perSport((sport) => {
    const durations = durationsOf(sport)
    return {
      durations,
      years: years.flatMap((year) => {
        const curve = CURVE_OF[sport](year.curves)
        const values = durations.map((durationS) => {
          const value = curve.find((point) => point.durationS === durationS)?.value ?? Number.NaN
          const native = NATIVE[sport](value)
          return native > 0 && Number.isFinite(native) ? native : null
        })
        if (values.every((value) => value === null)) return []
        const headline = curve.find((point) => point.durationS === HEADLINE_DURATION_S)
        return [
          {
            year: year.year,
            values,
            hard: headline !== undefined && pointShownHard(year, headline, input),
          },
        ]
      }),
    }
  })
}

/** Each sport's best curve in each calendar year, for the chart that sets the years' curves side by side. */
export const yearCurves: HistoryPart<YearCurves> = {
  empty,
  build,
  same: (a, b) => sameRidePricing(a, b) && sameHardness(a, b),
}
