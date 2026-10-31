import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { HeadlinePick } from '../components'
import type { BalanceReading } from '../components/balanceScale'
import type { LeftOutRuns } from '../analysis/walkingPaceCopy'
import { BalanceMeter } from '../components/BalanceMeter'
import { uncheckedNote, unconfirmedSports } from '../components/headlineNeed'
import { levelsTitle } from '../components/headlineText'
import { CountWalkingRuns } from '../components/WalkingChoice'
import { WeightPrompt } from '../components/WeightPrompt'
import { countSport } from '../records'
import { holdWithRideOut } from '../rideLeftOut'
import type { RideLeftOut } from '../rideLeftOut'
import { eyebrowText, titleParts } from './balanceCopy'
import { useHoldInputs } from '../holdContext'
import { fewEffortsText, missingText } from './balanceMissing'
import { BalanceLede } from './BalanceLede'
import { PAGE_HEADING_ID } from './pageHeading'

export interface BalanceHeroProps {
  result: AnalysisResult
  /** Every activity in the library, so an empty period can say what it leaves out. */
  library: ActivitySummary[]
  /** The energy comparison the headline falls back to; it names the effort the lede is taken at. */
  pick: HeadlinePick | null
  /**
   * The balance the page states, or null while it is held: the sports cannot be compared yet, or the weight is
   * missing. The page works it out once, so the headline, the tiles and the changes cannot disagree.
   */
  reading: BalanceReading | null
  /** What the lower sport would need to grade level with the higher, as a sentence, under the lede; null when nothing would. */
  target?: string | null
  /** The period on screen, named in the eyebrow and when it holds nothing to compare. */
  period: Period
  /** Shows all time, for when the period on screen holds nothing to compare. */
  onShowAll: () => void
  /** False while no body weight is entered: a ride's figures wait for it, so the balance does too. */
  weightKnown: boolean
  /** The share button, under the visual it shares; in the plain states, under the line that says what is missing. */
  action?: ReactNode
  /** Each sport's level as the tiles show it, when it is graded. A missing sport's title can name the other's. */
  runLevel?: string | null
  rideLevel?: string | null
  /** Why the ride is out of the comparison when it is not for want of efforts, so the held balance says so. */
  rideLeftOut?: RideLeftOut | null
  /** Each sport's level, as one line under the meter; with the meter's grades missing, the one sport on file's. */
  levels?: ReactNode
  /** The period control, under the levels it changes. */
  controls?: ReactNode
  /** Runs that are all at walking pace and left out: the headline says so and offers to count them. */
  leftOut?: LeftOutRuns
}

/**
 * The answer: a headline that names it, one plain sentence, and the meter, a single line with the gap and its
 * range written at the dot. Each sport's level is one line under the meter, and the period control under that.
 * Where the two sports cannot be compared yet, the headline says what is missing.
 */
export function BalanceHero({
  result,
  library,
  pick,
  reading,
  target = null,
  period,
  onShowAll,
  weightKnown,
  action = null,
  runLevel = null,
  rideLevel = null,
  rideLeftOut = null,
  levels = null,
  controls = null,
  leftOut,
}: BalanceHeroProps) {
  const hold = useHoldInputs()
  const head = (title: ReactNode, className?: string) => (
    <div className="balance-hero__head">
      <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={className}>
        {title}
      </h1>
    </div>
  )
  // Once both sports are on file, the balance is held for the weight: the one prompt says why.
  if (
    !weightKnown &&
    countSport(result.activities, 'run') > 0 &&
    countSport(result.activities, 'ride') > 0
  ) {
    return (
      <section className="balance-hero">
        {head(
          levelsTitle({ run: runLevel }, unconfirmedSports(result)) ??
            'Your balance waits for your weight',
        )}
        <p className="lede secondary">
          <WeightPrompt />
        </p>
        {action}
        {controls}
      </section>
    )
  }
  if (reading === null) {
    const { title, detail, canShowAll } = missingText(
      result,
      library,
      period,
      { run: runLevel, ride: rideLevel },
      leftOut?.count ?? 0,
      holdWithRideOut(rideLeftOut, hold),
    )
    return (
      <div className="balance-hero__pair">
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
          {leftOut !== undefined && (
            <CountWalkingRuns count={leftOut.count} onCount={leftOut.onCount} />
          )}
          {levels === null ? action : null}
        </section>
        {levels}
        {controls}
        {levels === null ? null : action}
      </div>
    )
  }
  const { lead, sport, noun } = titleParts(reading)
  const few = fewEffortsText(result)
  // A comparison that rests on a best nothing could check (no heart rate on it) is shown, with that said beside it.
  const unchecked = uncheckedNote(result)
  return (
    <div className="balance-hero__pair">
      <section className="balance-hero balance-hero--answer">
        <div className="balance-hero__text">
          <p className="eyebrow">{eyebrowText(period)}</p>
          {head(
            <>
              {lead}
              {sport === null ? null : (
                <em className="balance-hero__sport" data-sport={sport}>
                  {noun}
                </em>
              )}
            </>,
            'balance-hero__title',
          )}
          <p className="lede secondary balance-hero__lede">
            <BalanceLede
              reading={reading}
              durationS={pick?.point.durationS ?? HEADLINE_DURATION_S}
            />
          </p>
          {target !== null && <p className="secondary">{target}</p>}
          {few !== null && <p className="secondary">{few}</p>}
          {unchecked !== null && <p className="secondary">{unchecked}</p>}
        </div>
      </section>
      <BalanceMeter reading={reading} adjusted={pick?.calibrated ?? false} />
      {levels}
      {controls}
      {action}
    </div>
  )
}
