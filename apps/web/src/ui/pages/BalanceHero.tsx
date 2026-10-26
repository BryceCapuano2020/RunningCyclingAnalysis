import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { BalanceGap } from '../balanceGap'
import type { HeadlinePick } from '../components'
import { BalanceMeter } from '../components/BalanceMeter'
import { balanceOfPick } from '../components/balanceScale'
import { HARDER_EFFORTS_TITLE, balanceSummary, balanceTitle } from '../components/headlineText'
import { periodDates } from '../components/rangeOptions'
import { WeightPrompt } from '../components/WeightPrompt'
import { betweenClause } from '../periodCopy'
import { plural } from '../components/plural'
import { countSport } from '../records'
import { HEADLINE_LABEL } from '../grades'
import { PAGE_HEADING_ID } from './pageHeading'

export interface BalanceHeroProps {
  result: AnalysisResult
  /** Every activity in the library, so an empty period can say what it leaves out. */
  library: ActivitySummary[]
  /** The energy comparison the headline falls back to, or null when the sports cannot be compared yet. */
  pick: HeadlinePick | null
  /** The age-grade gap when both sports are graded. It is the headline and the meter when present. */
  gap: BalanceGap | null
  /** The period on screen, named when it holds nothing to compare. */
  period: Period
  /** Shows all time, for when the period on screen holds nothing to compare. */
  onShowAll: () => void
  /** False while no body weight is entered: a ride's figures wait for it, so the balance does too. */
  weightKnown: boolean
  /** Set beside the headline: the sample's chip and the share buttons. */
  aside?: ReactNode
  /** Each sport's level as the cards show it, when it is graded. A missing sport's title can name the other's. */
  runLevel?: string | null
  rideLevel?: string | null
  /** The grades under the meter on a phone. They share the meter's group, so they keep its gap. */
  strip?: ReactNode
}

interface Missing {
  title: string
  detail: string
  /** Whether All time would show something the period leaves out. */
  canShowAll: boolean
}

/** What is missing before the two sports can be compared, in the period on screen. */
function missingText(
  result: AnalysisResult,
  library: ActivitySummary[],
  period: Period,
  levels: { run: string | null; ride: string | null },
): Missing {
  const runs = countSport(result.activities, 'run')
  const rides = countSport(result.activities, 'ride')
  const libraryRuns = countSport(library, 'run')
  const libraryRides = countSport(library, 'ride')
  // All time names no period; a dated one says which dates it is missing a sport between.
  const when = period.days === null ? '' : ` ${betweenClause(period)}`
  const anyInLibrary = libraryRuns + libraryRides > 0
  if (runs > 0 && rides === 0) {
    if (libraryRides > 0) {
      return {
        title: `No rides${when}`,
        detail: `You have ${plural(libraryRides, 'ride')} in All time.`,
        canShowAll: true,
      }
    }
    return {
      title: levels.run
        ? `Your running is at ${levels.run} level. Add a ride to see your balance.`
        : 'Add a ride to see your balance',
      detail: 'Your run results are below.',
      canShowAll: false,
    }
  }
  if (rides > 0 && runs === 0) {
    if (libraryRuns > 0) {
      return {
        title: `No runs${when}`,
        detail: `You have ${plural(libraryRuns, 'run')} in All time.`,
        canShowAll: true,
      }
    }
    return {
      title: levels.ride
        ? `Your cycling is at ${levels.ride} level. Add a run to see your balance.`
        : 'Add a run to see your balance',
      detail: 'Your ride results are below.',
      canShowAll: false,
    }
  }
  if (runs === 0 && rides === 0) {
    if (anyInLibrary) {
      return {
        title: `No runs or rides${when}`,
        detail: `You have ${plural(libraryRuns, 'run')} and ${plural(libraryRides, 'ride')} in All time.`,
        canShowAll: true,
      }
    }
    return {
      title: 'Add a run and a ride to see your balance',
      detail: 'Your files have no running or cycling activities yet.',
      canShowAll: false,
    }
  }
  return {
    title: HARDER_EFFORTS_TITLE,
    detail: `From ${plural(runs, 'run')} and ${plural(rides, 'ride')}. A hard ${HEADLINE_LABEL} run or ride would let them be compared.`,
    canShowAll: false,
  }
}

/**
 * The answer: which way your balance leans, and the gap as a meter. The text is capped to a reading
 * measure; the meter is a sibling, so it spans the width of the card row beneath it.
 */
export function BalanceHero({
  result,
  library,
  pick,
  gap,
  period,
  onShowAll,
  weightKnown,
  aside,
  runLevel = null,
  rideLevel = null,
  strip = null,
}: BalanceHeroProps) {
  const reading = weightKnown ? balanceOfPick(gap, pick) : null
  const head = (title: ReactNode, className?: string) => (
    <div className="balance-hero__head">
      <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={className}>
        {title}
      </h1>
      {aside}
    </div>
  )
  // Once both sports are on file, the balance is held for the weight: the one prompt says why.
  if (
    !weightKnown &&
    countSport(result.activities, 'run') > 0 &&
    countSport(result.activities, 'ride') > 0
  ) {
    return (
      <>
        <section className="balance-hero">
          {head('Your balance waits for your weight')}
          <p className="lede secondary">
            <WeightPrompt />
          </p>
        </section>
        {strip}
      </>
    )
  }
  if (reading === null) {
    const { title, detail, canShowAll } = missingText(result, library, period, {
      run: runLevel,
      ride: rideLevel,
    })
    return (
      <>
        <section className="balance-hero">
          {head(title)}
          <p className="lede secondary">{detail}</p>
          {canShowAll && (
            <p>
              <button type="button" className="btn" onClick={onShowAll}>
                Show all time
              </button>
            </p>
          )}
        </section>
        {strip}
      </>
    )
  }
  const summary = balanceSummary(reading, pick?.point.durationS ?? HEADLINE_DURATION_S)
  // A dated period names its dates ahead of the answer, so the lede says what it covers.
  const dates = period.days === null ? '' : periodDates(period)
  return (
    <>
      <section className="balance-hero">
        {head(balanceTitle(reading), 'balance-hero__title')}
        <p className="lede secondary">{dates === '' ? summary : `${dates}. ${summary}`}</p>
      </section>
      <div className="balance-hero__meter">
        <BalanceMeter reading={reading} />
        {strip}
      </div>
    </>
  )
}
