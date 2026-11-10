import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { HeadlinePick } from '../components'
import type { BalanceReading } from '../components/balanceScale'
import type { LeftOutRuns } from '../analysis/walkingPaceCopy'
import { comparedGrades, triangleReading } from '@rca/core/standing'
import { LevelTriangle } from '../components/LevelTriangle'
import { uncheckedRows } from '../components/headlineNeed'
import { energySummary, levelsTitle } from '../components/headlineText'
import { NumText } from '../components/NumText'
import { SECTION_ID } from '../components/methodTopics'
import { NO_ROWS } from '../components/property'
import type { Property } from '../components/property'
import { CountWalkingRuns } from '../components/WalkingChoice'
import { WeightPrompt } from '../components/WeightPrompt'
import { countSport } from '../records'
import { holdWithRideOut } from '../rideLeftOut'
import type { RideLeftOut } from '../rideLeftOut'
import { titleParts } from './balanceCopy'
import { triangleLine, triangleRows, triangleTitle, triangleTitleText } from './triangleCopy'
import type { TriangleView } from '../triangleSports'
import { useHoldInputs } from '../holdContext'
import { fewEffortsText, missingText } from './balanceMissing'
import { PAGE_HEADING_ID } from './pageHeading'
import { PageDetails } from './PageDetails'

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
  /**
   * The grades of the level triangle, the figure under the answer. The headline and the line read the same grades, so the words
   * and the figure cannot disagree.
   */
  triangle: TriangleView
  /** The period's status and Custom form, under the title. */
  controls?: ReactNode
  /**
   * The Details under the answer as a detail panel's rows: the period's dates and counts, what the lower sport would need
   * to match the higher, and the standards the grades are read against.
   */
  details?: readonly Property[]
  /** Runs that are all at walking pace and left out: the headline says so and offers to count them. */
  leftOut?: LeftOutRuns
}

/**
 * The answer: a headline that names it, one plain sentence, and the level triangle, each sport's grade on its own corner. The
 * period's dates and counts, each sport's range, the target and any caveat are behind one ▸ Details under the sentence.
 * Where the two sports cannot be compared yet, the headline says what is missing.
 */
export function BalanceHero({
  result,
  library,
  pick,
  reading,
  period,
  onShowAll,
  weightKnown,
  action = null,
  runLevel = null,
  rideLevel = null,
  rideLeftOut = null,
  triangle,
  controls = null,
  details = NO_ROWS,
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
        {head(levelsTitle({ run: runLevel }) ?? 'Your balance waits for your weight')}
        <p className="lede secondary">
          <WeightPrompt />
        </p>
        {controls}
        <PageDetails
          rows={details}
          method={SECTION_ID.grades}
          methodName="how the balance is graded"
        />
        {action}
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
          {controls}
          {detail === '' ? null : <p className="lede secondary">{detail}</p>}
          <PageDetails
            rows={details}
            method={SECTION_ID.grades}
            methodName="how the balance is graded"
          />
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
        </section>
        <LevelTriangle view={triangle} />
        {action}
      </div>
    )
  }
  // The grades' headline and line, by the rules of three sports (with two it is the page's own words); an energy balance has none.
  const graded = triangleReading(comparedGrades(triangle.grades))
  const points = reading.unit === 'points'
  const title = (points ? triangleTitle(graded) : null) ?? titleParts(reading)
  const line = points
    ? triangleLine(graded)
    : energySummary(reading, pick?.point.durationS ?? HEADLINE_DURATION_S)
  const few = fewEffortsText(result)
  // The points rest on each sport's threshold, so no line says a best was not all-out. An energy balance still rests on the best
  // 20 min, and one nothing could check (no heart rate on it) is shown, with that said beside it.
  const unchecked = reading.unit === 'percent' ? uncheckedRows(result) : []
  // The heart-rate check informs only an energy balance's range, which the meter used to say under it; now it is a Details row.
  const adjusted = reading.unit === 'percent' && (pick?.calibrated ?? false)
  return (
    <div className="balance-hero__pair">
      <section className="balance-hero balance-hero--answer">
        <div className="balance-hero__text">
          {head(triangleTitleText(title), 'balance-hero__title')}
          {controls}
          <p className="balance-hero__lede">
            <NumText text={line ?? ''} />
          </p>
          {/* The answer is the sentence and this one line; the period, the target and any caveat are one press down. */}
          <PageDetails
            rows={[
              ...details,
              ...(few === null ? [] : [{ label: 'Efforts used', value: few }]),
              ...unchecked,
              ...triangleRows(triangle),
              ...(adjusted ? [{ label: 'Range', value: 'Informed by heart rate' }] : []),
            ]}
            method={SECTION_ID.grades}
            methodName="how the balance is graded"
          />
        </div>
      </section>
      <LevelTriangle view={triangle} />
      {action}
    </div>
  )
}
