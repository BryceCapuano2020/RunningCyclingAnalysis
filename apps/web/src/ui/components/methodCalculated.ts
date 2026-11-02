import { CP_FIT_MAX_S, CP_FIT_MIN_S, HEADLINE_DURATION_S } from '@rca/core/constants'
import { CHANGE } from '@rca/core/change'
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

/** The shortest and longest efforts a threshold is fitted to, as copy: "3 to 20 min". */
const THRESHOLD_EFFORTS = `${CP_FIT_MIN_S / 60} to ${effortLabel(CP_FIT_MAX_S)}`

/** The longer best a threshold's floor is taken from, s: the best 30 min where the curve holds one. */
const FLOOR_LONG_S = 30 * 60

const HEADLINE = effortLabel(HEADLINE_DURATION_S)

/** The entries about the efforts and what is drawn from them, calculated by the app, in page order. */
export const ANALYSIS_ENTRIES: readonly MethodEntry[] = [
  {
    name: 'Thresholds and floors',
    state: 'calculated',
    lines: [
      `A threshold is critical speed for a run and critical power for a ride, fitted to your best ${THRESHOLD_EFFORTS} efforts.`,
      'Its range is the fit’s own range, which is not the balance’s 90% range.',
      `A floor, marked “At least”, is your best ${effortLabel(FLOOR_LONG_S)} or else ${HEADLINE}, and your real threshold is at least that.`,
      `A ${HEADLINE} best that was not hard sets a floor instead of a threshold.`,
    ],
    detail: [
      `A best under ${HEADLINE} is labelled with its length and is not a floor.`,
      'A best that mixed hard and easy is left out of the fit.',
      'The range then runs up to a fit without it.',
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
      'The simulated libraries had a real library’s spread.',
      'Periods with no change were called a change in 3% to 8% of pairs on a record row.',
      'On a title or the strip, it was 2% to 5%.',
      'The same simulations found a 10% gain in a run’s 20 min in about two athletes in five.',
      'For a ride’s 5 min, a 10% gain was found in about one athlete in eight.',
      'A swing in how many hard efforts a period holds is not allowed for.',
      'It reads as a change in the best.',
    ],
  },
  {
    name: 'The default period',
    state: 'calculated',
    lines: [
      'The default period is the shortest window where every sport qualifies.',
      'The windows tried are 12 weeks, 26 weeks and 12 months.',
      'Each sport needs 3 activities with a usable effort.',
      'Each sport also needs a 20 min best that is hard, or not checked.',
      'If no window qualifies, the default is the one with evidence for every sport and the most sports qualifying.',
      'With no evidence for every sport, all time is used.',
      'Evidence is a threshold, or a 20 min best.',
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
