import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { BalanceGap } from '../balanceGap'
import type { HeadlinePick } from '../components'
import { BalanceMeter } from '../components/BalanceMeter'
import { balanceOfPick } from '../components/balanceScale'
import { HARDER_EFFORTS_TITLE, balanceSummary, balanceTitle } from '../components/headlineText'
import { rangePeriod } from '../components/rangeOptions'
import { hrefFor } from '../route'
import { countSport } from '../records'
import { PAGE_HEADING_ID } from './pageHeading'

export interface BalanceHeroProps {
  result: AnalysisResult
  /** The energy comparison the headline falls back to, or null when the sports cannot be compared yet. */
  pick: HeadlinePick | null
  /** The age-grade gap when both sports are graded. It is the headline and the meter when present. */
  gap: BalanceGap | null
  /** The period on screen in days, or null for all time. A missing sport is named for this period. */
  rangeDays: number | null
  /** Shows all time, for when the period on screen holds nothing to compare. */
  onShowAll: () => void
  /** False while no body weight is entered: a ride's figures wait for it, so the balance does too. */
  weightKnown: boolean
}

/** What is missing before the two sports can be compared, in the period on screen. */
function missingText(
  result: AnalysisResult,
  period: string | null,
): { title: string; detail: string } {
  const runs = countSport(result.activities, 'run')
  const rides = countSport(result.activities, 'ride')
  if (runs > 0 && rides === 0) {
    return {
      title: period === null ? 'Add rides to see your balance' : `No rides in the ${period}`,
      detail: 'Your running is below.',
    }
  }
  if (rides > 0 && runs === 0) {
    return {
      title: period === null ? 'Add runs to see your balance' : `No runs in the ${period}`,
      detail: 'Your cycling is below.',
    }
  }
  if (runs === 0 && rides === 0) {
    return period === null
      ? {
          title: 'Add a run and a ride to see your balance',
          detail: 'Your files have no running or cycling activities yet.',
        }
      : {
          title: `No runs or rides in the ${period}`,
          detail: 'Your files have no running or cycling in this period.',
        }
  }
  return {
    title: HARDER_EFFORTS_TITLE,
    detail:
      'Both sports are in your files, but no efforts of the same length could be compared yet.',
  }
}

/**
 * The answer: which way your balance leans, and the gap as a meter. The text is capped to a reading
 * measure; the meter is a sibling, so it spans the width of the card row beneath it.
 */
export function BalanceHero({
  result,
  pick,
  gap,
  rangeDays,
  onShowAll,
  weightKnown,
}: BalanceHeroProps) {
  const reading = weightKnown ? balanceOfPick(gap, pick) : null
  // Once both sports are on file, the balance is held for the weight: the one prompt says why.
  if (
    !weightKnown &&
    countSport(result.activities, 'run') > 0 &&
    countSport(result.activities, 'ride') > 0
  ) {
    return (
      <section className="balance-hero">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Your balance waits for your weight
        </h1>
        <p className="lede secondary">
          Add your weight on <a href={hrefFor({ page: 'profile' })}>Profile</a> to compare a ride
          with a run.
        </p>
      </section>
    )
  }
  if (reading === null) {
    // A period names itself in the copy, and offers all time, since a longer one may hold both.
    const period = rangeDays === null ? null : rangePeriod(rangeDays).toLowerCase()
    const { title, detail } = missingText(result, period)
    return (
      <section className="balance-hero">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          {title}
        </h1>
        <p className="lede secondary">{detail}</p>
        {period !== null && (
          <p>
            <button type="button" className="btn" onClick={onShowAll}>
              Show all time
            </button>
          </p>
        )}
      </section>
    )
  }
  const title = balanceTitle(reading)
  const summary = balanceSummary(reading, pick?.point.durationS ?? HEADLINE_DURATION_S)
  return (
    <>
      <section className="balance-hero">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="balance-hero__title">
          {title}
        </h1>
        <p className="lede secondary">{summary}</p>
      </section>
      <BalanceMeter reading={reading} />
    </>
  )
}
