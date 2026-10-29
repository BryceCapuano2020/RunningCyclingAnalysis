import type { Sport } from '@rca/core/types'
import type { BalanceReading } from '../components/balanceScale'
import { percentEdge, signedCount } from '../components/headlineText'
import { HEADLINE_LABEL } from '../grades'
import { SPORT_ACTIVITY, SPORT_NOUN } from '../sports'
import type { MovedItem } from './whatMoved'

/** What the added activity did, for a balance that did not change: its sport, and where it sits. */
export interface AddedBalance {
  sport: Sport
  /** Whether it set a new best at the headline duration. */
  newBest: boolean
  /** Whether a workout of its sport is on the period on screen, rather than outside it. */
  onScreen: boolean
}

/**
 * The centre as the Balance page states it: a whole count of points, signed for an even balance, or
 * a percent edge. Null where the page states no centre, which is an even energy balance.
 */
function centreShown({ unit, lean, lead }: BalanceReading): string | null {
  if (unit === 'percent') return lean === 'even' ? null : percentEdge(Math.abs(lead.centre), false)
  return lean === 'even' ? signedCount(lead.centre) : String(Math.abs(Math.round(lead.centre)))
}

/**
 * The range as the Balance page states it, "A to B" as its own range text writes it. Its two edges are
 * shown as a range only when they round apart; otherwise the page states one value, which the centre
 * already says.
 */
function rangeOf({ unit, lean, lead }: BalanceReading): { words: string; isRange: boolean } {
  // A lean toward the second sport has a negative lead, so its edges are read the other way round.
  const flip = lean !== 'even' && lead.centre < 0
  const [low, high] = flip ? [-lead.high, -lead.low] : [lead.low, lead.high]
  const isRange = Math.round(low) !== Math.round(high)
  const middle = (low + high) / 2
  // A range that reaches zero or the other side is signed, as the page writes it.
  const signed = lean === 'even' || Math.round(low) < 0
  if (unit === 'percent') {
    const edge = (value: number) => percentEdge(value, signed)
    const words = isRange ? `${edge(low)} to ${edge(high)}` : edge(middle)
    return { words, isRange }
  }
  const count = (value: number) => (signed ? signedCount(value) : String(Math.round(value)))
  const words = isRange ? `${count(low)} to ${count(high)}` : count(middle)
  return { words, isRange }
}

/** The unit that follows a points figure, or nothing: a percent edge already carries its own sign. */
function unitSuffix(unit: BalanceReading['unit']): string {
  return unit === 'points' ? ' points' : ''
}

/** The lean's words for a balance whose lean changed. These name no figure. */
function leanText(after: BalanceReading): MovedItem {
  if (after.lean === 'even') return { text: 'Your running and cycling are now in balance' }
  return { text: `Your balance now leans toward ${SPORT_NOUN[after.lean]}` }
}

/** The centre's words for a lean that held while its centre moved, such as "(12% → 8%)" or "(7 → 6 points)". */
function centreText(before: BalanceReading, after: BalanceReading): MovedItem {
  const from = centreShown(before) ?? ''
  const to = centreShown(after) ?? ''
  const suffix = unitSuffix(after.unit)
  if (after.lean === 'even') {
    return { text: `Your balance's best estimate moved from ${from} to ${to}${suffix}` }
  }
  const direction = Math.abs(after.lead.centre) < Math.abs(before.lead.centre) ? 'less' : 'more'
  const sport = SPORT_NOUN[after.lean]
  return {
    text: `Your balance now leans ${direction} toward ${sport} (${from} → ${to}${suffix})`,
    spoken: `Your balance now leans ${direction} toward ${sport}, from ${from} to ${to}${suffix}`,
  }
}

/**
 * A range that moved, in the page's own wording, such as "range was 5% to 20% and is now 2% to 25%".
 * Each range is said whole, so the "to" inside one never runs into the "to" between two.
 */
function rangeWords(before: BalanceReading, after: BalanceReading): string {
  const suffix = unitSuffix(after.unit)
  return `range was ${rangeOf(before).words}${suffix} and is now ${rangeOf(after).words}${suffix}`
}

/**
 * What a change in the balance's displayed figures says: its lean, its centre or its range, whichever
 * moved, and both where the centre and the range moved together. A range counts only where the page
 * shows one, on either side, so a value that stays one value is not called a moved range. Null when
 * every figure is the same.
 */
function changedItem(before: BalanceReading, after: BalanceReading): MovedItem | null {
  const leanMoved = before.lean !== after.lean
  const centreMoved = centreShown(before) !== centreShown(after)
  const rangeBefore = rangeOf(before)
  const rangeAfter = rangeOf(after)
  const rangeMoved =
    (rangeBefore.isRange || rangeAfter.isRange) && rangeBefore.words !== rangeAfter.words
  if (!leanMoved && !centreMoved && !rangeMoved) return null
  const main = leanMoved ? leanText(after) : centreMoved ? centreText(before, after) : null
  if (main === null) return { text: `Your balance's ${rangeWords(before, after)}` }
  if (!rangeMoved) return main
  const joined = `, and the ${rangeWords(before, after)}`
  return {
    text: `${main.text}${joined}`,
    ...(main.spoken === undefined ? {} : { spoken: `${main.spoken}${joined}` }),
  }
}

/** The line for a balance that held on every figure the page shows, with what the added activity did. */
function heldItem(added: AddedBalance): MovedItem {
  const activity = SPORT_ACTIVITY[added.sport]
  if (!added.onScreen) {
    return {
      text: `This ${activity} is outside the period on screen, so the balance there is unchanged.`,
      unmoved: true,
    }
  }
  const noBest = added.newBest ? '' : `: this ${activity} set no new best at ${HEADLINE_LABEL}`
  return { text: `Your balance did not move${noBest}.`, unmoved: true }
}

/**
 * The balance line for an import, from the figures the Balance page shows before and after: the lean,
 * the centre and the range. A change in any of them is said as that change. Only when every figure is
 * the same does it say the balance did not move, and then, for an import that added one activity,
 * whether that activity set a new best at the headline duration. Null for an import that added none.
 */
export function balanceMoveItem(
  before: BalanceReading,
  after: BalanceReading,
  added: AddedBalance | null,
): MovedItem | null {
  const changed = changedItem(before, after)
  if (changed !== null) return changed
  return added === null ? null : heldItem(added)
}
