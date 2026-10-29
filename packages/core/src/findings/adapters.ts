import type { Sport } from '../types'
import { formatPace, formatPower, paceSeconds, PACE_UNIT } from '../units'
import type { SportAdapter } from './types'

/**
 * How each sport's output is read and said. A detector asks the adapter, so none branches on the sport.
 * `usable` is the rule sameHeartRate reads its blocks by: an indoor run's pace and an estimated ride's
 * watts can be what is wrong, so they are not read.
 */
export const SPORT_ADAPTERS: Record<Sport, SportAdapter> = {
  run: {
    sport: 'run',
    noun: 'run',
    nounPlural: 'runs',
    outputName: 'pace',
    usable: (digest) => !digest.indoor,
    outputDistribution: 'speed',
    format: formatPace,
    difference: (from, to, system) => ({
      amount: `${Math.round(Math.abs(paceSeconds(to, system) - paceSeconds(from, system)))} s${PACE_UNIT[system]}`,
      word: to >= from ? 'faster' : 'slower',
    }),
    minRelativeChange: 0.025,
  },
  ride: {
    sport: 'ride',
    noun: 'ride',
    nounPlural: 'rides',
    outputName: 'power',
    usable: (digest) => digest.powerSource === 'measured',
    outputDistribution: 'power',
    format: (output) => formatPower(output),
    difference: (from, to) => ({
      amount: formatPower(Math.abs(to - from)),
      word: to >= from ? 'more' : 'less',
    }),
    minRelativeChange: 0.03,
  },
}
