import type { Interval, PairReading } from '@rca/core/types'
import { leanOfLead, type Lead, type Lean } from '../../domain/lean'
import type { BalanceGap } from '../balanceGap'
import { BALANCE_PAIR } from '../sports'
import type { HeadlinePick } from './pickHeadline'

/**
 * The balance the headline and the share card state. Its lead is in points of age
 * grade when both sports are graded, and in percent of energy when they are not.
 */
export interface BalanceReading extends PairReading {
  pair: typeof BALANCE_PAIR
  unit: 'points' | 'percent'
  lean: Lean
  lead: Lead
}

/** An energy ratio of running over cycling as a lead in percent. Cycling over running is its inverse. */
function percentLead(ratio: number): number {
  return (ratio >= 1 ? ratio - 1 : -(1 / ratio - 1)) * 100
}

/** The balance from an energy ratio: the model's 90% range of running over cycling, in percent. */
export function energyReading(ratio: Interval): BalanceReading {
  const lead: Lead = {
    centre: percentLead(ratio.p50),
    low: percentLead(ratio.p05),
    high: percentLead(ratio.p95),
  }
  return { pair: BALANCE_PAIR, unit: 'percent', lean: leanOfLead(lead), lead }
}

/** The balance from the age-grade gap, in points. */
export function gapReading(gap: BalanceGap): BalanceReading {
  return {
    pair: BALANCE_PAIR,
    unit: 'points',
    lean: gap.lean,
    lead: { centre: gap.centre, low: gap.low, high: gap.high },
  }
}

/**
 * The balance to show: the grade gap when there is one, otherwise the energy ratio, otherwise null.
 * Every surface reads its balance through this, so they cannot disagree.
 */
export function balanceReading(
  gap: BalanceGap | null,
  ratio: Interval | null,
): BalanceReading | null {
  if (gap !== null) return gapReading(gap)
  return ratio === null ? null : energyReading(ratio)
}

/**
 * The balance a page or a card states, from its grade gap and the headline's energy comparison. Without a
 * pick the headline is held, so the gap is held with it: every surface that states the balance follows.
 */
export function balanceOfPick(
  gap: BalanceGap | null,
  pick: HeadlinePick | null,
): BalanceReading | null {
  return pick === null ? null : balanceReading(gap, pick.point.ratio)
}
