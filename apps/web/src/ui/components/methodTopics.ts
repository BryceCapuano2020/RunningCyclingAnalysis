import {
  ESTIMATED_RIDE_MIN_RIDES,
  ESTIMATED_RIDE_MIN_SHARE,
  FLAT_RUN_COST,
  PRIORS,
  RUN_COST_CORRECTION,
} from '@rca/core/constants'
import { ENERGY_RATE_UNIT } from '@rca/core/units'
import { CLIMB_NEEDED } from './headlineNeed'

/** The ids of the sections on How sure is this?, which the contents list and the links name. */
export const SECTION_ID = {
  energy: 'method-energy',
  grades: 'method-grades',
  heart: 'method-hr',
  accuracy: 'method-accuracy',
  how: 'method-how',
} as const

const EFFICIENCY_PERCENT = (PRIORS.grossEfficiency.mean * 100).toFixed(1)
const spreadPercent = (prior: { mean: number; sd: number }) =>
  Math.round((prior.sd / prior.mean) * 100)

/**
 * The topics that sit in a section of their own, beside the chart or the figures they explain. Everything
 * else the method says is an entry in the one How this works list (methodEntries.ts).
 */
const TOPIC_LIST = [
  {
    id: 'unit',
    title: 'One unit for both sports',
    plain: [
      `Both sports use one scale, the energy rate in ${ENERGY_RATE_UNIT}.`,
      'It is the energy each sport costs per kilogram of body weight.',
      'Cycling power becomes that energy through gross efficiency.',
      'Gross efficiency is the share of the energy the body burns that reaches the pedals.',
      'Running speed and gradient become energy using published research.',
    ],
    detail: [
      `Gross efficiency averages about ${EFFICIENCY_PERCENT}%.`,
      'Running uses the energy cost of running from Minetti et al. (2002).',
      `That is raised by ${RUN_COST_CORRECTION} J/kg/m, so flat running costs ${FLAT_RUN_COST.toFixed(1)} J/kg/m.`,
      'J/kg/m is joules of energy per kilogram of body weight, per metre travelled.',
    ],
  },
  {
    id: 'range',
    title: 'Why there is a range',
    plain: [
      'People differ in efficiency and in running economy.',
      'A file cannot show either one.',
      'So the app gives a range instead of one number.',
      'The range is not a fitness percentile.',
    ],
    detail: [
      `Efficiency varies between people by about ${spreadPercent(PRIORS.grossEfficiency)}%.`,
      `Running economy varies by about ${spreadPercent(PRIORS.runEconomyScale)}%.`,
      'Those spreads are the model’s assumptions behind the range.',
      'A threshold and a race prediction each have a range of their own.',
    ],
  },
  {
    id: 'heart',
    title: 'Heart-rate check',
    plain: [
      'Heart rate checks the model.',
      'It does not measure fitness.',
      'If the data are consistent enough to inform the range, the range is shifted to match.',
      'If not, the population range is kept.',
      'This is a consistency check on your own data.',
      'It is not a validated correction.',
    ],
    detail: [
      'The model assumes heart rate responds to energy rate in a similar way in both sports.',
      'So differences in the fitted slopes can adjust the energy estimates.',
      'That is not an independent measure of efficiency.',
      'Each sport’s best efforts are judged against its max heart rate, in beats per minute (bpm).',
      'The max is the highest sustained heart rate that several separate days reached in the last three years.',
      'One stray reading sets nothing.',
      'A cycling maximum usually runs 5 to 7 bpm lower than a running one.',
      'So the cycling max allows for that.',
      'A max counts only if it could be one.',
      'Under about 150 bpm (lower where your age gives a lower maximum), a max is too low.',
      'A heart rate far above the usual maximum for your age is not trusted until you confirm it.',
      'If your typical day already reaches nearly the same heart rate as your highest, the max is where you usually train.',
      'It does not show what you can reach.',
      'In those cases a share of it does not prove an effort was hard.',
      'The max heart rate you enter on Profile replaces it.',
    ],
  },
  {
    id: 'virtual',
    title: 'Virtual power meter',
    plain: [
      'Rides without a power meter get an estimated power on climbs, from speed, gradient and weight.',
      'The model is fitted to your rides that have a power meter.',
      'Its accuracy is checked on each ride, with that ride left out of the fit.',
      'Only climbs are used.',
      'Wind and drafting dominate on flat roads.',
      `For the headline length, that means ${CLIMB_NEEDED}.`,
      'A long ride, or a hilly one with shorter climbs, has no estimated best at that length.',
      `Once you have ${ESTIMATED_RIDE_MIN_RIDES} power-meter rides with heart rate, the rule below applies.`,
      'An estimate counts toward your bests only when heart rate backs it.',
      `It needs at least ${Math.round(ESTIMATED_RIDE_MIN_SHARE * 100)}% of the heart rate your power-meter rides show at that power for that duration.`,
      'An estimate with no heart rate never beats a measured effort.',
    ],
    detail: [
      'Air density follows the altitude in the file, using the International Standard Atmosphere (ISA, 15 °C at sea level).',
      'Sea level is used when altitude is missing or the ride is indoors.',
    ],
  },
] as const

/** The part of the method a topic covers. Derived from the list, so the ids are written once. */
export type TopicId = (typeof TOPIC_LIST)[number]['id']

/** One part of the method: its plain lines, and the technical detail behind a disclosure, also in lines. */
export interface Topic {
  id: TopicId
  title: string
  plain: readonly string[]
  detail?: readonly string[]
}

export const TOPICS: readonly Topic[] = TOPIC_LIST

const TOPIC_BY_ID = new Map<TopicId, Topic>(TOPICS.map((topic) => [topic.id, topic]))

export function topicOf(id: TopicId): Topic {
  const topic = TOPIC_BY_ID.get(id)
  if (!topic) throw new Error(`No method topic ${id}`)
  return topic
}
