import { firstWeekOf, quantile, replaySim, simulate, slipWeeks } from './runSim'
import type { SimSpec } from './runSim'

/** The nuisances of the silence budget, as generator settings: nothing in the athlete changes in any of them. */
export const NUISANCES = {
  quiet: {},
  'a season of 1.5%': { seasonal: 0.015 },
  'a season of 3%': { seasonal: 0.03 },
  'a slow wander of 3%': { wanderSd: 0.03, wanderRho: 0.95 },
  'a watch or strap change of 3%': { strap: 0.03 },
  'every nuisance at once': {
    wanderSd: 0.03,
    wanderRho: 0.95,
    seasonal: 0.02,
    strap: 0.03,
    heat: 0.03,
    hilly: 0.3,
    bad: 0.1,
  },
} as const satisfies Record<string, Partial<SimSpec>>

export interface Silence {
  /** Slip declarations an athlete-year. */
  alarms: number
  /** Share of libraries that ended in a state other than holding. */
  endingNotHolding: number
  /** Share of evaluated weeks not holding. */
  weeksNotHolding: number
}

/** Libraries where nothing changes, `years` long, three steady runs a week by default. */
export function silence(
  spec: Partial<SimSpec>,
  libraries: number,
  years = 5,
  perWeek = 3,
  firstSeed = 1001,
): Silence {
  const weeks = years * 52
  let alarms = 0
  let ending = 0
  let notHolding = 0
  let evaluated = 0
  for (let seed = firstSeed; seed < firstSeed + libraries; seed++) {
    const records = replaySim(simulate({ ...spec, weeks, perWeek }, seed), weeks)
    alarms += slipWeeks(records).length
    const last = records.at(-1)!.shown
    if (last !== 'holding' && last !== 'nodata' && last !== 'thin') ending++
    for (const r of records) {
      if (r.shown === 'nodata') continue
      evaluated++
      if (r.shown !== 'holding' && r.shown !== 'thin') notHolding++
    }
  }
  return {
    alarms: alarms / (libraries * years),
    endingNotHolding: ending / libraries,
    weeksNotHolding: notHolding / evaluated,
  }
}

export interface Planted {
  /** Libraries in which a slip was declared at or after the change. */
  seen: number
  /** Share of all libraries still not holding at the end. */
  open: number
  /** Weeks from the change to the first declared slip (Infinity when never), per library. */
  lags: number[]
  /** Share that reached back within 52 weeks of the return (for a planted return), of those that slipped. */
  back: number
}

export const within = (xs: number[], weeks: number): number =>
  xs.filter((x) => x <= weeks).length / xs.length

/**
 * A planted loss of `size` at `week` (a step), with an optional return of `back` at `returnWeek`, observed `after`
 * weeks past the change (or the return). The step is late enough in the library that the seasonal term and the learned
 * floor, which need two years, are live.
 */
export function planted(
  options: {
    size: number
    back?: number
    perWeek?: number
    week?: number
    returnWeek?: number
    after?: number
  } & Partial<SimSpec>,
  libraries: number,
  firstSeed = 1,
): Planted {
  const {
    size,
    back,
    perWeek = 3,
    week = 170,
    returnWeek = week + 40,
    after = 70,
    ...extra
  } = options
  const weeks = (back === undefined ? week : returnWeek) + after
  const steps: NonNullable<SimSpec['planted']> = [{ type: 'step', week, size }]
  if (back !== undefined) steps.push({ type: 'step', week: returnWeek, size: back })
  const lags: number[] = []
  let open = 0
  let seen = 0
  let backed = 0
  let slipped = 0
  for (let seed = firstSeed; seed < firstSeed + libraries; seed++) {
    const records = replaySim(simulate({ ...extra, weeks, perWeek, planted: steps }, seed), weeks)
    const first = firstWeekOf(records, week, 'slipping')
    lags.push(first === null ? Number.POSITIVE_INFINITY : first - week + 1)
    if (first !== null) {
      seen++
      slipped++
      const b = firstWeekOf(records, returnWeek, 'back')
      if (b !== null && b - returnWeek <= 52) backed++
    }
    if (records.at(-1)!.shown !== 'holding') open++
  }
  return {
    seen: seen / libraries,
    open: open / libraries,
    lags,
    back: slipped === 0 ? 0 : backed / slipped,
  }
}

export { quantile }
