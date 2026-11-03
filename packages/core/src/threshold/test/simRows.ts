import type { ThresholdBlock, ThresholdEffort, ThresholdEstimate } from '../types'
import { simRiders } from './simRider'
import type { Profile, Scenario, SimRider } from './simRider'

/*
 * The cases of a threshold simulation judged against the truth (threshold.sim.test.ts for riders, runThreshold.sim.test.ts for
 * runners): the harness both read, so the two tables are made the same way.
 */

/** One answer judged against the truth, over all the riders of a case. */
export interface Arm {
  /** Error against the true threshold, in percent, one entry per rider. */
  errors: number[]
  /** How many riders had their true threshold between the answer's low and high. */
  covered: number
}

export interface Row {
  riders: number
  estimate: Arm
  /** The same riders with no heart rate passed: the power estimate itself. */
  powerOnly: Arm
  /** The errors of the rules of thumb the estimate replaces, by name. */
  rules: Map<string, number[]>
  /** How many riders got no heart-rate estimate, by reason. */
  refused: Map<string, number>
  /** How many riders got an answer under the one without heart rate. */
  lowered: number
}

export type Estimator = (
  efforts: readonly ThresholdEffort[],
  blocks: readonly ThresholdBlock[],
  thresholdHr: number | null,
) => ThresholdEstimate | null

/** A rule of thumb: the threshold it reads for a rider, from the rider's efforts. */
export type Rule = (rider: SimRider) => number

/** The best of a rider's efforts at one length. */
export const bestAt = (rider: SimRider, durationS: number): number =>
  Math.max(...rider.efforts.filter((e) => e.durationS === durationS).map((e) => e.value))

export function runCase(
  scenario: Scenario,
  profile: Profile,
  riders: number,
  seed: number,
  estimator: Estimator,
  rules: Record<string, Rule>,
): Row {
  const row: Row = {
    riders,
    estimate: { errors: [], covered: 0 },
    powerOnly: { errors: [], covered: 0 },
    rules: new Map(Object.keys(rules).map((name) => [name, []])),
    refused: new Map(),
    lowered: 0,
  }
  for (const rider of simRiders(scenario, riders, seed, profile)) {
    const error = (value: number) => (value / rider.threshold - 1) * 100
    const judge = (arm: Arm, result: { value: number; low: number; high: number }) => {
      arm.errors.push(error(result.value))
      if (result.low <= rider.threshold && rider.threshold <= result.high) arm.covered++
    }
    const result = estimator(rider.efforts, rider.blocks, rider.thresholdHr)!
    judge(row.estimate, result)
    const alone = estimator(rider.efforts, [], null)!
    judge(row.powerOnly, alone)
    if (result.value < alone.value) row.lowered++
    for (const [name, rule] of Object.entries(rules)) row.rules.get(name)!.push(error(rule(rider)))
    if ('refused' in result.heartRate) {
      const why = result.heartRate.refused
      row.refused.set(why, (row.refused.get(why) ?? 0) + 1)
    }
  }
  return row
}

export const median = (errors: number[]) => [...errors].sort((a, b) => a - b)[errors.length >> 1]!
export const within5 = (errors: number[]) =>
  errors.filter((e) => Math.abs(e) <= 5).length / errors.length
export const coverage = (arm: Arm) => arm.covered / arm.errors.length
export const refusedShare = (row: Row) =>
  [...row.refused.values()].reduce((total, n) => total + n, 0) / row.riders

/** The rows of a table, as docs/design/threshold.md prints them: the answer and power alone, then each rule of thumb. */
export function tableLine(name: string, row: Row): string {
  const pct = (x: number) => `${Math.round(100 * x)}%`
  const sign = (x: number) => `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(1)}%`
  const cell = (arm: Arm) =>
    `${sign(median(arm.errors))}, ${pct(within5(arm.errors))}, ${pct(coverage(arm))}`
  const old = [...row.rules].map(
    ([rule, errors]) => `${rule} ${sign(median(errors))}, ${pct(within5(errors))}`,
  )
  const why = [...row.refused].map(([reason, n]) => `${reason} ${n}`).join(', ')
  return `| ${name} | ${cell(row.estimate)} | ${cell(row.powerOnly)} | ${old.join('; ')} | refused ${pct(refusedShare(row))} (${why}) |`
}
