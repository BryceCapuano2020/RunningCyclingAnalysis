import {
  ESTIMATED_RIDE_MIN_RIDES,
  ESTIMATED_RIDE_MIN_SHARE,
  FLAT_RUN_COST,
  PRIORS,
  RUN_COST_CORRECTION,
} from '@rca/core/constants'
import { ENERGY_RATE_UNIT } from '@rca/core/units'
import {
  DEFAULT_WINDOW_DAYS,
  EFFORT_LENGTHS_S,
  MIN_WINDOW_DAYS,
  trendWindowDays,
} from '@rca/core/digest/trendPoints'
import { HEADLINE_LABEL } from '../grades'
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
 * Each fixed period the picker offers, with the window the trend really uses for it, in days. The
 * default and all time have no fixed length, so they are not listed.
 */
const WINDOW_EXAMPLES = listWords(
  RANGE_OPTIONS.flatMap((option) =>
    typeof option.choice === 'number'
      ? [`${option.label.toLowerCase()} uses ${trendWindowDays(option.choice)} days`]
      : [],
  ),
)

const EFFICIENCY_PERCENT = (PRIORS.grossEfficiency.mean * 100).toFixed(1)
const spreadPercent = (prior: { mean: number; sd: number }) =>
  Math.round((prior.sd / prior.mean) * 100)

const TOPIC_LIST = [
  {
    id: 'unit',
    title: 'One unit for both sports',
    plain: [
      `Both sports go on one scale: the energy rate (${ENERGY_RATE_UNIT}), the energy each sport costs per kilogram of body weight. Cycling power is turned into that energy using gross efficiency: the share of the energy the body burns that reaches the pedals. Running speed and gradient are turned into it using published research.`,
    ],
    detail:
      `Gross efficiency averages about ${EFFICIENCY_PERCENT}%. Running uses the energy cost of ` +
      `running from Minetti et al. (2002), raised by ${RUN_COST_CORRECTION} J/kg/m, so flat ` +
      `running costs ${FLAT_RUN_COST.toFixed(1)} J/kg/m. J/kg/m is joules of energy per kilogram ` +
      'of body weight, per metre travelled.',
  },
  {
    id: 'range',
    title: 'Why there is a range',
    plain: [
      'People differ in efficiency and in running economy, and a file cannot show either one. So the app gives a range rather than one number, and the range is not a fitness percentile.',
    ],
    detail:
      `Efficiency varies between people by about ${spreadPercent(PRIORS.grossEfficiency)}%, and ` +
      `running economy by about ${spreadPercent(PRIORS.runEconomyScale)}%. Those spreads are the ` +
      'model’s assumptions behind the range. Two other spreads are not that range. A threshold’s ' +
      '“fit spread” is one standard error of the fit either side of the threshold; it shows how ' +
      'loosely the fit was pinned down, not where your capability lies. A race prediction’s ' +
      '“assumed spread” is a typical prediction error for that distance: the marathon’s comes from ' +
      'a published validation, and the shorter races’ are a judgement, scaled down with distance.',
  },
  {
    id: 'trend',
    title: `Best ${HEADLINE_LABEL}, week by week`,
    plain: [
      `Each point is one week, ending on a Sunday in UTC. It shows your best effort in each sport over the chosen length: ${EFFORT_PHRASE}. Balance uses ${HEADLINE_LABEL}. Running is shown as flat pace, your pace allowing for hills as if on level ground, and cycling as power in watts.`,
      `Each point looks back over a window that ends that Sunday. Each window is a third of the period’s length, kept between ${MIN_WINDOW_DAYS} and ${DEFAULT_WINDOW_DAYS} days, so ${WINDOW_EXAMPLES}. All time uses ${DEFAULT_WINDOW_DAYS} days. Each window lies inside the period you chose.`,
      'A gap means no run or ride of that length fell inside the window.',
    ],
    detail:
      'Each effort is judged on energy rate and converted with the period’s one bike model, which is ' +
      'fitted to its activities. The ' +
      'headline reports the median, the middle of the model’s simulated answers, which ' +
      'heart-rate calibration can shift, so the headline and the trend can differ slightly. The ' +
      'range shown with the headline is not drawn for each week.',
  },
  {
    id: 'heart',
    title: 'Heart-rate check',
    plain: [
      'Heart rate is used to check the model, not to measure fitness. If the data are consistent enough to inform the range, it is shifted to match; if not, the population range is kept. The step is a consistency check on your own data, not a validated correction.',
    ],
    detail:
      'The model assumes heart rate responds to energy rate in a similar way in both sports, so ' +
      'differences in the fitted slopes can adjust the energy estimates. That is not an ' +
      'independent measure of efficiency. Each sport’s best efforts are judged against a ' +
      'reference maximum, in beats per minute (bpm), set from the highest sustained heart rate that several separate days ' +
      'reached in the last three years, so one stray reading sets nothing. A cycling maximum usually runs 5 to 7 bpm lower than a running one, so the cycling ' +
      'reference allows for that.',
  },
  {
    id: 'virtual',
    title: 'Virtual power meter',
    plain: [
      `Rides without a power meter get an estimated power on climbs, from speed, gradient and weight. The model is fitted to your rides that have a power meter, and its accuracy is checked on each ride with that ride left out of the fit. Only climbs are used, because wind and drafting dominate on flat roads. For the headline length that means ${CLIMB_NEEDED}: a long ride, or a hilly one whose climbs are shorter, has no estimated best at that length.`,
      `Once you have ${ESTIMATED_RIDE_MIN_RIDES} power-meter rides with heart rate, an estimated effort counts toward your bests only when your heart rate backs it: at least ${Math.round(ESTIMATED_RIDE_MIN_SHARE * 100)}% of the heart rate your power-meter rides show at that power for that duration. An estimate with no heart rate never beats a measured effort.`,
    ],
    detail:
      'Air density follows the altitude in the file, using the International Standard Atmosphere ' +
      '(ISA, 15 °C at sea level). Sea level is used when altitude is missing or the ride is indoors.',
  },
  {
    id: 'settings',
    title: 'Dated settings and zones',
    plain: [
      'On Profile you can date a body weight, a max heart rate or a threshold. Each activity uses the setting in effect on its own day: the latest entry that starts on or before it. Before your first entry your earliest one applies. With none, ride figures use your current weight, and thresholds and heart rates are estimated from your activities.',
      'Training zones are cut from those settings by published schemes: Coggan’s seven power levels, five heart-rate zones of your max, and Friel’s pace zones from threshold pace. A zone set made from your own activities says so.',
    ],
    detail:
      'A ride’s W/kg, and the watts estimated for a ride without a power meter, use the body and ' +
      'bike weight in effect on that ride’s local day, so a ride from last year does not use ' +
      'today’s weight. With dated weights the best ride at a duration is the one with the most watts ' +
      'per kilogram on its day, and that one ride supplies its watts, slope and running equivalent. Your current weight is the dated weight in effect today, and setting it once ' +
      'weights are dated adds an entry from today. The saved summary of an activity holds no weight, ' +
      'so changing a dated weight changes results without reading any file again.',
  },
  {
    id: 'data',
    title: 'Data checks',
    plain: [
      'Sensor dropouts and implausible readings are left out automatically. Each activity lists its problems with the time they occurred.',
    ],
  },
  {
    id: 'speed',
    title: 'Where speed comes from',
    plain: [
      'A file that records speed uses that speed. Otherwise speed is worked out from distance, or from the GPS track.',
    ],
    detail:
      'A TCX file with device distance but no speed derives speed from that distance: the change ' +
      'in distance over the 10 s either side of each point (a centred difference). GPX files never ' +
      'carry device speed, and neither does a TCX file with only positions, so their speed comes ' +
      'from the GPS track. That uses a 20 s window centred on each point, rejects fixes that imply ' +
      'more than twice the sport’s maximum speed, and credits no distance across a gap longer than ' +
      '30 s. Speeds below 0.5 m/s count as still. Short best efforts under about 30 s from GPS-only ' +
      'files are less reliable than from a device.',
  },
  {
    id: 'limits',
    title: 'Limits',
    plain: [
      'Best efforts are only as good as the hardest efforts on file. Heat, altitude and fatigue shift heart rate. Treadmill and indoor data have no gradient, so they are treated as flat. Indoor pace is never used for bests, thresholds or predictions, but its time, distance and heart rate count.',
      `Running bests by time start at ${effortLabel(RECORD_DURATIONS_S.run[0]!)} and the running curve at ${effortLabel(CURVE_START_S.run)}, because shorter slope-adjusted windows mostly measure the slope reading rather than the runner.`,
    ],
  },
] as const

/** The part of the method a topic covers. Derived from the list, so the ids are written once. */
export type TopicId = (typeof TOPIC_LIST)[number]['id']

/** One part of the method: its plain words, and the technical detail behind a disclosure. */
export interface Topic {
  id: TopicId
  title: string
  plain: readonly string[]
  detail?: string
}

export const TOPICS: readonly Topic[] = TOPIC_LIST

const TOPIC_BY_ID = new Map<TopicId, Topic>(TOPICS.map((topic) => [topic.id, topic]))

/** The topics the How this works list on Method holds: the ones with no chart of their own. */
export const HOW_THIS_WORKS: readonly TopicId[] = ['trend', 'settings', 'data', 'speed', 'limits']

export function topicOf(id: TopicId): Topic {
  const topic = TOPIC_BY_ID.get(id)
  if (!topic) throw new Error(`No method topic ${id}`)
  return topic
}
