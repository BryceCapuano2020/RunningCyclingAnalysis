import {
  ESTIMATED_RIDE_MIN_RIDES,
  ESTIMATED_RIDE_MIN_SHARE,
  HALF_MARATHON_M,
  HEADLINE_DURATION_S,
  HR_BLOCK_S,
  HR_SKIP_S,
  RACE_LOG_SD,
  RIEGEL_EXPONENT,
  RUN_COST_CORRECTION,
} from '@rca/core/constants'
import {
  ECONOMY_SPREAD_PERCENT,
  EFFICIENCY_SPREAD_PERCENT,
  FLAT_RUN_COST_J_PER_KG_M,
  GROSS_EFFICIENCY_PERCENT,
  HOUR_AGREEMENT_PERCENT,
  rideThresholdPercentOf,
  runOxygenExcessPercent,
  THRESHOLD_SHORTEST_S,
} from '@rca/core/display'
import { HABITUAL_MIN_DAYS, HIGH_OVER_PREDICTED_BPM, RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import { ESTIMATED_WEIGHT, HALF_LIFE_DAYS } from '@rca/core/threshold'
import { ENERGY_RATE_UNIT, formatDuration } from '@rca/core/units'
import { CLIMB_NEEDED } from '../components/headlineNeed'
import { effortLabel } from '../records'

/** The effort Balance reads, as copy: "20 min". */
const HEADLINE = effortLabel(HEADLINE_DURATION_S)
const percent = (share: number) => `${Math.round(share * 100)}%`

/** How a threshold and a race time are worked out, every number from core. One fact a line. */
export const THRESHOLD_LEAD =
  'A threshold is what you could hold for about an hour: a pace for a run, functional threshold power for a ride.'

export const THRESHOLD_FACTS: readonly string[] = [
  `Each activity’s strongest effort from ${formatDuration(THRESHOLD_SHORTEST_S.ride)} for a ride, or ${formatDuration(THRESHOLD_SHORTEST_S.run)} for a run, is scaled to an hour.`,
  `A ride’s threshold from a ${HEADLINE} best is ${rideThresholdPercentOf(HEADLINE_DURATION_S)}% of it, as in the usual FTP test.`,
  `A run scales by Daniels and Gilbert’s table, which puts an all-out ${HEADLINE} ${runOxygenExcessPercent(HEADLINE_DURATION_S / 60)}% above the hour’s oxygen cost.`,
  `The estimates are averaged, favouring those near your top and recent ones, whose weight halves every ${HALF_LIFE_DAYS} days.`,
  'Heart rate can raise a ride’s threshold, never lower it.',
  `An hour you held is a floor when your next best hour is within ${HOUR_AGREEMENT_PERCENT}% of it.`,
  'The range is the 10th to 90th percentile.',
]

export const RACE_FACTS: readonly string[] = [
  'Balance’s run row leads with your predicted half marathon, when there is one.',
  `Times blend your best runs from the mile up with VO2max from heart rate, carried by Riegel’s formula (exponent ${RIEGEL_EXPONENT}).`,
  'The marathon adds your weekly distance, by Vickers and Vertosick’s model.',
  'A time is never slower than one you have run.',
  `Likely time is the 10th to 90th percentile: a ${(RACE_LOG_SD[HALF_MARATHON_M] * 100).toFixed(1)}% spread for the half, wider where the two methods disagree.`,
  'With no hard run in the window, times come from easier running.',
]

/** The energy view: one scale for both sports. */
export const ENERGY_LEAD = `The energy view puts both sports on one scale: the energy each costs per kilogram, in ${ENERGY_RATE_UNIT}.`

export const ENERGY_FACTS: readonly string[] = [
  `Ride power converts at ${GROSS_EFFICIENCY_PERCENT.toFixed(1)}% gross efficiency, and flat running costs ${FLAT_RUN_COST_J_PER_KG_M.toFixed(1)} J/kg/m (Minetti et al. 2002, plus ${RUN_COST_CORRECTION}).`,
  `People differ in efficiency by about ${EFFICIENCY_SPREAD_PERCENT}% and in running economy by ${ECONOMY_SPREAD_PERCENT}%, so it is a 90% range.`,
  'Where your heart rate agrees across both sports, the range shifts to match it, else it rests on population figures.',
]

/** The line under the energy facts, by what Balance shows: the age-grade gap it cross-checks, or this ratio itself. */
export const ENERGY_CROSS_CHECK =
  'It cross-checks the age-grade gap on Balance, and near even the two can lean opposite ways.'
export const ENERGY_FALLBACK =
  'With no age-grade gap, Balance shows this ratio: running’s energy rate as a percentage of cycling’s.'

/** The heart-rate check. The line with the defined term is the page's own, since it holds a control. */
export const HEART_LEAD =
  'Heart rate says whether a best effort was hard. It does not measure fitness.'

export const HEART_FACTS: readonly string[] = [
  'Your max is the highest sustained heart rate that several separate days reached in the last three years, unless you enter one on Profile.',
  `Running uses the higher of your two maxima, cycling the higher of its own and ${RIDE_MAX_OFFSET_BPM} bpm under running’s.`,
  `With under ${HABITUAL_MIN_DAYS} days of heart rate, it is the usual max for your age, if known.`,
  `A max too low for your age, ${HIGH_OVER_PREDICTED_BPM} bpm over its usual max, or one your typical day nearly reaches cannot call an effort hard.`,
  `Heart rate is read in ${formatDuration(HR_BLOCK_S)} steady blocks, after each activity’s first ${formatDuration(HR_SKIP_S)}.`,
]

/** The virtual power meter. */
export const VIRTUAL_LEAD =
  'Rides without a power meter get estimated watts on climbs, from speed, gradient and your weight.'

export const VIRTUAL_FACTS: readonly string[] = [
  'The model is fitted to your power-meter rides, and checked on each with that ride left out.',
  'Only climbs count: wind and drafting dominate on the flat.',
  `In a threshold, estimated watts count ${percent(ESTIMATED_WEIGHT)} as much as measured ones.`,
  `A ${HEADLINE} best needs ${CLIMB_NEEDED}.`,
  `Once ${ESTIMATED_RIDE_MIN_RIDES} power-meter rides have heart rate, an estimate counts toward bests only when heart rate backs it.`,
  `That takes at least ${percent(ESTIMATED_RIDE_MIN_SHARE)} of the heart rate those rides show at that power.`,
]
