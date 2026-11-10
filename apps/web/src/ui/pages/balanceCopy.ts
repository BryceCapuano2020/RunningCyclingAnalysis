import type { Period } from '@rca/core/period'
import type { BalanceReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import { lengthOf, periodName } from '../components/rangeOptions'
import { SPORT_NOUN } from '../sports'
import type { TriangleTitle } from './triangleCopy'

/**
 * The headline of an energy balance, which has no grades, split at the sport it leans toward so that sport can be marked, as the
 * graded headline is (`triangleTitle`): a balance that leans names its sport last, a level one is one phrase.
 */
export function titleParts(reading: BalanceReading): TriangleTitle {
  const title = balanceTitle(reading)
  if (reading.lean === 'even') return { lead: title, sports: [] }
  const noun = SPORT_NOUN[reading.lean]
  return { lead: title.slice(0, title.length - noun.length), sports: [reading.lean] }
}

/**
 * The line over the headline: the period as a length, "Last 12 weeks", "All time", or "Custom period" for a range
 * entered. The dates are on the period line under the headline, so they are not said twice. The default is named for
 * the window it resolved to.
 */
export function eyebrowText(period: Period): string {
  if (typeof period.choice === 'object') return 'Custom period'
  return period.days === null ? periodName(null) : `Last ${lengthOf(period.days)}`
}
