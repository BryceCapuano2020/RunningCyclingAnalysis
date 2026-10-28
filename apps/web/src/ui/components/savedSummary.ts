import { formatMonth } from '../format/date'
import { SPORT_ACTIVITY, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import type { AnalysisController } from '../useAnalysis'
import { plural } from './plural'

type Saved = AnalysisController['savedActivities']

/** The activities by sport, each workout once, and the months they span: "1,947 runs and 146 rides, from Mar 2011 to Oct 2026". */
export function savedSummary(saved: Saved): string {
  // Copies of one workout are saved apart, and the Activities list counts the workout once, so this does too.
  const activities = [...new Map(saved.map((a) => [`${a.sport}|${a.startMs}`, a])).values()]
  const parts = SPORT_ORDER.flatMap((sport) => {
    const count = activities.filter((activity) => activity.sport === sport).length
    return count === 0 ? [] : [plural(count, SPORT_ACTIVITY[sport], SPORT_PLURAL[sport])]
  })
  const earliest = activities.reduce((low, { startMs }) => Math.min(low, startMs), Infinity)
  const latest = activities.reduce((high, { startMs }) => Math.max(high, startMs), -Infinity)
  const [first, last] = [earliest, latest].map((ms) => formatMonth(ms, true))
  return `${parts.join(' and ')}, ${first === last ? first : `from ${first} to ${last}`}`
}
