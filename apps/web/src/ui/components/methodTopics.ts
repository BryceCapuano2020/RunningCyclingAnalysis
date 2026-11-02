import {
  ESTIMATED_RIDE_MIN_RIDES,
  ESTIMATED_RIDE_MIN_SHARE,
  FLAT_RUN_COST,
  HEADLINE_DURATION_S,
  PRIORS,
  RUN_COST_CORRECTION,
} from '@rca/core/constants'
import { CHANGE } from '@rca/core/change'
import { ENERGY_RATE_UNIT } from '@rca/core/units'
import {
  DEFAULT_WINDOW_DAYS,
  EFFORT_LENGTHS_S,
  MIN_WINDOW_DAYS,
  trendWindowDays,
} from '@rca/core/digest/trendPoints'
import { CURVE_START_S, RECORD_DURATIONS_S, effortLabel } from '../records'
import { CLIMB_NEEDED } from './headlineNeed'
import { RANGE_OPTIONS } from './rangeOptions'

/** The ids of the sections on How sure is this?, which the contents list and the links name. */
export const SECTION_ID = {
  energy: 'method-energy',
  grades: 'method-grades',
  heart: 'method-hr',
  accuracy: 'method-accuracy',
  calculated: 'method-calculated',
  how: 'method-how',
} as const

/** "a, b and c", for a short list in a sentence. */
const listWords = (items: readonly string[]) =>
  `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** The effort lengths the trend offers, as copy: "5 min, 20 min or 60 min". */
const EFFORT_PHRASE = (() => {
  const lengths = EFFORT_LENGTHS_S.map((durationS) => effortLabel(durationS))
  return `${lengths.slice(0, -1).join(', ')} or ${lengths.at(-1)}`
})()

/**
 * Each fixed period the picker offers, with the window the trend really uses for it, in days. All time has no
 * fixed length, so it is not listed.
 */
const WINDOW_EXAMPLES = listWords(
  RANGE_OPTIONS.flatMap((option) =>
    typeof option.choice === 'number'
      ? [`${option.label.toLowerCase()} uses ${trendWindowDays(option.choice)} days`]
      : [],
  ),
)

/** The longer best a threshold's floor is taken from, s: the best 30 min where the curve holds one. */
const FLOOR_LONG_S = 30 * 60

const EFFICIENCY_PERCENT = (PRIORS.grossEfficiency.mean * 100).toFixed(1)
const spreadPercent = (prior: { mean: number; sd: number }) =>
  Math.round((prior.sd / prior.mean) * 100)

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
      'Two other spreads are not that range.',
      'A threshold’s own range is drawn lighter.',
      'It runs down by one standard error of the fit.',
      'It runs up by an allowance for how hard the effort behind it was.',
      'A best that was not quite all-out puts the fit under the truth.',
      'So the spread reaches further above the threshold than below it.',
      'It reaches further the less clearly hard the effort was.',
      'The allowance is calibrated on simulated athletes.',
      'It is not measured on people.',
      'The spread shows how loosely the fit was pinned down.',
      'It does not show where your capability lies.',
      'A race prediction’s range is a typical prediction error for that distance.',
      'The marathon’s range comes from a published validation.',
      'The shorter races’ ranges are a judgement, scaled down with distance.',
    ],
  },
  {
    id: 'period',
    title: 'The default period',
    plain: [
      'The default period is the shortest window where every sport qualifies.',
      'The windows tried are 12 weeks, 26 weeks and 12 months.',
      'Each sport needs 3 activities with a usable effort.',
      'Each sport also needs a 20 min best that is hard, or not checked.',
      'If no window qualifies, the default is the one with evidence for every sport and the most sports qualifying.',
      'With no evidence for every sport, all time is used.',
      'A period you pick yourself is always used.',
    ],
    detail: [
      'Evidence is a threshold, or a 20 min best.',
      'If two windows tie, the shorter one is used.',
    ],
  },
  {
    id: 'trend',
    title: 'Best efforts over time',
    plain: [
      'Each dot is the best effort of its stretch, on the day it was done.',
      `Each chart is for one length: ${EFFORT_PHRASE}.`,
      'Running uses grade-adjusted pace (GAP).',
      'That is your pace allowing for hills, as if on level ground.',
      'Cycling uses power in watts.',
      'Older dots are fainter.',
      'There is no line.',
      'The days between two dots hold no reading.',
      'A line through best efforts shows how often you went hard as much as how fit you were.',
      'A fitness status comes from steady efforts at the same heart rate.',
      'Where a sport has one, that status is the trend.',
    ],
    detail: [
      'A dot is the effort that led a trailing window ending on some Sunday in UTC.',
      `Each window is a third of the period’s length, kept between ${MIN_WINDOW_DAYS} and ${DEFAULT_WINDOW_DAYS} days.`,
      `So ${WINDOW_EXAMPLES}.`,
      `All time uses ${DEFAULT_WINDOW_DAYS} days.`,
      'Each effort is judged on energy rate.',
      'It is converted with the period’s one bike model, which is fitted to its activities.',
    ],
  },
  {
    id: 'threshold',
    title: 'Thresholds and “at least”',
    plain: [
      '“At least” before a threshold marks a floor.',
      'Your real threshold is at least that figure.',
      `A floor is your best ${effortLabel(FLOOR_LONG_S)}, or else your best ${effortLabel(HEADLINE_DURATION_S)}.`,
      `A ${effortLabel(HEADLINE_DURATION_S)} best that was not hard does not set a threshold.`,
      'A best that was not hard is a floor, so real ability is at least that.',
    ],
    detail: [
      `A best under ${effortLabel(HEADLINE_DURATION_S)} is labelled with its length.`,
      'It is not a floor.',
    ],
  },
  {
    id: 'change',
    title: 'How a change is called',
    plain: [
      'The app calls a change only when it is bigger than chance.',
      'Chance is worked out from your own efforts in both periods.',
      'It pools the efforts of the period and the one before.',
      'It deals them out at random into a “now” and a “before” side, each at its real size.',
      'It calls a change when the real difference falls outside the middle 90% of those deals.',
      'So the bar is yours.',
      'It is wider for a length with few efforts.',
      'It is also wider when efforts vary more.',
      `With fewer than ${CHANGE.minPerSide} efforts of a length in either period, the app says nothing about it.`,
      'A best is a floor on what you can do.',
      'So a period without a hard effort can read as lower.',
    ],
    detail: [
      `For each length the two periods’ efforts are dealt out ${CHANGE.draws.toLocaleString('en-US')} times.`,
      'Each difference is the natural log of one side’s best over the other’s.',
      'Running is compared as grade-adjusted speed, and cycling as watts per kilogram.',
      'So a change of weight between the periods is not read as a change of power.',
      'The band is the 5th to the 95th percentile of those deals.',
      'A card, a strip or a title that states a change on its own is held to the 2.5th to the 97.5th.',
      'On simulated libraries with a real library’s spread, periods with no change were called a change in 3% to 8% of pairs on a record row.',
      'On a title or the strip, it was 2% to 5%.',
      'The same simulations found a 10% gain in a run’s 20 min in about two athletes in five.',
      'For a ride’s 5 min, a 10% gain was found in about one athlete in eight.',
      'A swing in how many hard efforts a period holds is not allowed for.',
      'It reads as a change in the best.',
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
  {
    id: 'settings',
    title: 'Dated settings and zones',
    plain: [
      'On Profile, date a weight, max heart rate or threshold.',
      'Each activity uses the latest entry on or before its day.',
      'If none is older, it uses the earliest entry.',
      'With no entries, rides use your current weight.',
      'With no entries, thresholds and heart rates are estimated from your activities.',
      'Training zones are cut from those settings by published schemes.',
      'A zone set made from your own activities says so.',
    ],
    detail: [
      'Power uses Coggan’s seven power levels.',
      'Heart rate uses five zones of your max.',
      'Pace uses Friel’s pace zones from threshold pace.',
      'A ride’s W/kg, and the watts estimated for a ride without a power meter, use the body and bike weight in effect on that ride’s local day.',
      'So a ride from last year does not use today’s weight.',
      'With dated weights, the best ride at a duration is the one with the most watts per kilogram on its day.',
      'That one ride supplies its watts, slope and running equivalent.',
      'Your current weight is the dated weight in effect today.',
      'Setting it once weights are dated adds an entry from today.',
      'The saved summary of an activity holds no weight.',
      'So changing a dated weight changes results without reading any file again.',
    ],
  },
  {
    id: 'data',
    title: 'Data checks',
    plain: [
      'Sensor dropouts and implausible readings are left out automatically.',
      'Each activity lists its problems with the time they occurred.',
    ],
  },
  {
    id: 'speed',
    title: 'Where speed comes from',
    plain: [
      'A file that records speed uses that speed.',
      'Otherwise, speed comes from distance, or from the GPS track.',
    ],
    detail: [
      'A TCX file with device distance but no speed derives speed from that distance.',
      'It is the change in distance over the 10 s either side of each point (a centred difference).',
      'GPX files never carry device speed, and neither does a TCX file with only positions.',
      'Their speed comes from the GPS track.',
      'That uses a 20 s window centred on each point.',
      'It rejects fixes that imply more than twice the sport’s maximum speed.',
      'It credits no distance across a gap longer than 30 s.',
      'Speeds below 0.5 m/s count as still.',
      'Short best efforts under about 30 s from GPS-only files are less reliable than from a device.',
    ],
  },
  {
    id: 'limits',
    title: 'Limits',
    plain: [
      'Best efforts are only as good as the hardest efforts on file.',
      'Heat, altitude and fatigue shift heart rate.',
      'Treadmill and indoor data have no gradient, so they are treated as flat.',
      'Indoor pace is never used for bests, thresholds or predictions.',
      'Its time, distance and heart rate still count.',
    ],
    detail: [
      `Running bests by time start at ${effortLabel(RECORD_DURATIONS_S.run[0]!)} and the running curve at ${effortLabel(CURVE_START_S.run)}.`,
      'Shorter slope-adjusted windows mostly measure the slope reading, so they say little about the runner.',
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

/** The topics the How this works list on Method holds: the ones with no chart of their own. */
export const HOW_THIS_WORKS: readonly TopicId[] = [
  'period',
  'trend',
  'threshold',
  'change',
  'settings',
  'data',
  'speed',
  'limits',
]

export function topicOf(id: TopicId): Topic {
  const topic = TOPIC_BY_ID.get(id)
  if (!topic) throw new Error(`No method topic ${id}`)
  return topic
}
