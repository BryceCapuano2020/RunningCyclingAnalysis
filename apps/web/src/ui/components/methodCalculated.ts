import { WINDOW_DAYS, HEADLINE_MIN_ACTIVITIES } from '@rca/core/answer'
import { CHANGE } from '@rca/core/change'
import { FITNESS } from '@rca/core/fitness'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { CURVE_START_S, RECORD_DURATIONS_S, effortLabel } from '../records'
import type { MethodEntry } from './methodEntryTypes'

/** "a, b and c", for a short list in a sentence. */
const listWords = (items: readonly string[]) =>
  `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** A window of the default period's tries, in the words the picker uses: whole weeks, else months. */
const windowWords = (days: number) =>
  days % 7 === 0 ? `${days / 7} weeks` : `${Math.round(days / 30.4)} months`

/** The effort the default period and its evidence read, as copy: "20 min". */
const HEADLINE_LABEL = effortLabel(HEADLINE_DURATION_S)

/** The entries about the efforts and what is drawn from them, calculated by the app, in page order. */
export const ANALYSIS_ENTRIES: readonly MethodEntry[] = [
  {
    name: 'Best efforts and curves',
    state: 'calculated',
    lines: [
      `Your best pace or power for each length of time, with running bests from ${effortLabel(RECORD_DURATIONS_S.run[0]!)} and the curve from ${effortLabel(CURVE_START_S.run)}.`,
    ],
  },
  {
    name: 'How a change is called',
    state: 'calculated',
    lines: [
      `A change is called only outside the middle 90% of ${CHANGE.draws.toLocaleString('en-US')} random deals of both periods’ efforts.`,
      `It needs ${CHANGE.minPerSide} efforts of a length in each period.`,
    ],
  },
  {
    name: 'The default period',
    state: 'calculated',
    lines: [
      `The shortest of ${listWords(WINDOW_DAYS.map(windowWords))} in which every sport qualifies.`,
      `A sport needs ${HEADLINE_MIN_ACTIVITIES} activities with a usable effort and a ${HEADLINE_LABEL} best that is hard or not checked.`,
      'A period you pick is always used.',
    ],
  },
  {
    name: 'Fitness status',
    state: 'calculated',
    lines: [
      'Your pace, or a ride’s power, at your usual steady heart rate, against your earlier level, and over the years on History.',
      'A change of 8% shows within weeks for a run and three months for a ride, and under 5% is not reported.',
    ],
    detail: [
      `A steady run is outdoors with heart rate, its pace changing ${Math.round(FITNESS.unit.maxPaceChange * 100)}% or less from one kilometre to the next.`,
      'Intervals, hilly runs and treadmill runs do not count.',
      'A steady ride is outdoors with a power meter and heart rate.',
      `Your level is the middle of your steady activities over the last 4 to 16 weeks, at a heart rate to the nearest ${FITNESS.unit.referenceStepBpm} bpm.`,
    ],
  },
]
