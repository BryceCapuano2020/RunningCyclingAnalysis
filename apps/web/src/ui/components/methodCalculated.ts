import { WINDOW_DAYS, HEADLINE_MIN_ACTIVITIES } from '@rca/core/answer'
import { CHANGE } from '@rca/core/change'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { HOUR_AGREEMENT_PERCENT, runOxygenExcessPercent } from '@rca/core/display'
import {
  DEFAULT_WINDOW_DAYS,
  EFFORT_LENGTHS_S,
  MIN_WINDOW_DAYS,
  trendWindowDays,
} from '@rca/core/digest/trendPoints'
import { CURVE_START_S, RECORD_DURATIONS_S, effortLabel } from '../records'
import type { MethodEntry } from './methodEntryTypes'
import { RANGE_OPTIONS } from './rangeOptions'

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

/** A window of the default period's tries, in the words the picker uses: whole weeks, else months. */
const windowWords = (days: number) =>
  days % 7 === 0 ? `${days / 7} weeks` : `${Math.round(days / 30.4)} months`

/** The effort the default period and its evidence read, as copy: "20 min". */
const HEADLINE_LABEL = effortLabel(HEADLINE_DURATION_S)

/** The entries about the efforts and what is drawn from them, calculated by the app, in page order. */
export const ANALYSIS_ENTRIES: readonly MethodEntry[] = [
  {
    name: 'Thresholds',
    state: 'calculated',
    lines: [
      'A ride’s threshold is the strongest effort of each ride, scaled to an hour and averaged.',
      'A ride’s threshold can be raised by heart rate and never lowered.',
      'A run’s threshold is the strongest effort of each run, scaled to an hour and averaged.',
      'Neither is ever under a backed hour you did.',
      'Each range is the estimate’s own, not the balance’s 90% range.',
    ],
    detail: [
      'Each ride gives one estimate, from the effort that scales highest.',
      'A shorter effort is scaled down more than a longer one.',
      'The rides are averaged, with more weight on recent rides and on those near your top.',
      'Rides with estimated watts, from no power meter, weigh less than rides with one.',
      'Heart rate is a second estimate, fitted against power across your rides with each ride’s own offset taken out.',
      'So a hot day or a strap that sits differently does not flatten the line.',
      'Heart rate is left out of a ride where the strap sticks or reads far from your other rides.',
      'It is left out of every ride where it barely rises with power.',
      'A ride’s threshold says heart rate was not used when it could not be read.',
      'That is when no ride has both a power meter and heart rate.',
      'It is also when too little steady riding has both.',
      'It is also when heart rate does not move with power.',
      'It is also when heart rate rises too little or too steeply with power.',
      'It is also when no steady effort sat close to your threshold heart rate.',
      'Steady efforts of moderate length near your threshold heart rate give the second estimate.',
      'The answer is the estimate from power alone, unless heart rate shows you had more in you.',
      'Then it rises toward what heart rate reads, and no further.',
      'A ride’s range takes the higher 10th and the higher 90th percentile of the two estimates.',
      'Each run gives one estimate too, from the effort that scales highest.',
      'A run is scaled with Daniels and Gilbert’s published table of what a runner holds for each length.',
      `It puts an all-out 10 min effort ${runOxygenExcessPercent(10)}% above your hour’s oxygen cost, 20 min ${runOxygenExcessPercent(20)}% and 40 min ${runOxygenExcessPercent(40)}%.`,
      'The runs are averaged, with more weight on recent runs and on those near your top.',
      'A run’s range is the estimate’s own 10th to 90th percentile.',
      `An hour you ran or rode is backed when the next hour down is within ${HOUR_AGREEMENT_PERCENT}% of it.`,
      'It is also backed when it is no higher than the 90th percentile of the estimate.',
      'If the best hour is not backed, the second-best is tried the same way, and with neither backed there is no floor.',
      'A backed hour is a floor: the answer, and the low end of its range, are never under it.',
      'On simulated riders and runners, across the cases tested, the range held the true threshold for 65% to 97% of them.',
      'The estimates were tuned on simulated athletes with a known threshold.',
      'They are not measured on people.',
    ],
  },
  {
    name: 'Best efforts and curves',
    state: 'calculated',
    lines: [
      'The best pace or power you held for each length of time, from every activity in the period.',
      'Best efforts are only as good as the hardest efforts on file.',
      `Running bests by time start at ${effortLabel(RECORD_DURATIONS_S.run[0]!)} and the running curve at ${effortLabel(CURVE_START_S.run)}.`,
      'Shorter slope-adjusted windows mostly measure the slope reading, so they say little about the runner.',
    ],
  },
  {
    name: 'Best efforts over time',
    state: 'calculated',
    lines: [
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
      'A fitness status first takes your usual seasonal swing out of every steady run, when your runs show one.',
      'The size taken out is under See the evidence on the card.',
    ],
  },
  {
    name: 'How a change is called',
    state: 'calculated',
    lines: [
      'The app calls a change only when it is bigger than chance.',
      'Chance is worked out from your own efforts in both periods.',
      'It pools the efforts of the period and the one before.',
      'It deals them out at random into a “now” and a “before” side, each at its real size.',
      'It calls a change when the real difference falls outside the middle 90% of those deals.',
      'So the bar is yours.',
      'It is wider for a length with few efforts.',
      'It is also wider when efforts vary more.',
      `With fewer than ${CHANGE.minPerSide} efforts of a length in either period, the app says nothing about it.`,
      'When either period has no hard efforts, a change compares every effort, so an easy period can read as slower.',
    ],
    detail: [
      `For each length the two periods’ efforts are dealt out ${CHANGE.draws.toLocaleString('en-US')} times.`,
      'Each difference is the natural log of one side’s best over the other’s.',
      'Running is compared as grade-adjusted speed, and cycling as watts per kilogram.',
      'So a change of weight between the periods is not read as a change of power.',
      'The band is the 5th to the 95th percentile of those deals.',
      'A card, a strip or a title that states a change on its own is held to the 2.5th to the 97.5th.',
      'The simulated libraries had a real library’s spread.',
      'Periods with no change were called a change in 3% to 8% of pairs on a record row.',
      'On a title or the strip, it was 2% to 5%.',
      'The same simulations found a 10% gain in a run’s 20 min in about two athletes in five.',
      'For a ride’s 5 min, a 10% gain was found in about one athlete in eight.',
      'A best is a floor on what you can do.',
      'A swing in how many hard efforts a period holds is not allowed for.',
      'It reads as a change in the best.',
    ],
  },
  {
    name: 'The default period',
    state: 'calculated',
    lines: [
      'The default period is the shortest window where every sport qualifies.',
      `The windows tried are ${listWords(WINDOW_DAYS.map(windowWords))}.`,
      `Each sport needs ${HEADLINE_MIN_ACTIVITIES} activities with a usable effort.`,
      `Each sport also needs a ${HEADLINE_LABEL} best that is hard, or not checked.`,
      'If no window qualifies, the default is the one with evidence for every sport and the most sports qualifying.',
      'With no evidence for every sport, all time is used.',
      `Evidence is a threshold, or a ${HEADLINE_LABEL} best.`,
      'If two windows tie, the shorter one is used.',
      'A period you pick yourself is always used.',
    ],
  },
  {
    name: 'Race predictions',
    state: 'calculated',
    lines: [
      'Times for the usual road races, from your best runs, heart-rate VO2max and weekly running distance.',
      'A race prediction’s range is a typical prediction error for that distance.',
      'The marathon’s range comes from a published validation.',
      'The shorter races’ ranges are a judgement, scaled down with distance.',
      'Times are for a flat course on a good day.',
      'Where no run in the window was shown hard, the times come from easier running and have no range.',
      'A race effort would be faster.',
      'All time uses your best period.',
    ],
  },
  {
    name: 'Pace at heart rate',
    state: 'calculated',
    lines: [
      'Your pace, or power for rides, at one heart rate, week by week, from blocks of steady effort.',
      'The weekly dots claim no change.',
    ],
  },
  {
    name: 'History',
    state: 'calculated',
    lines: [
      'Your pace or power at one heart rate across the years, cut into plateaus.',
      'Each slip, return and rise is listed when the runs show it.',
    ],
  },
  {
    name: 'Best durations',
    state: 'calculated',
    lines: [
      'Each best is set against your own curve.',
      'A length that stands out from the rest is named.',
    ],
  },
]
