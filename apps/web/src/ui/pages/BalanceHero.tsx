import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { BalanceGap } from '../balanceGap'
import type { HeadlinePick } from '../components'
import { balanceOfPick } from '../components/balanceScale'
import { BalanceMeter } from '../components/BalanceMeter'
import { levelsTitle } from '../components/headlineText'
import { WeightPrompt } from '../components/WeightPrompt'
import { BALANCE_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { useNarrowScreen } from '../useNarrowScreen'
import { countSport } from '../records'
import { eyebrowText, gapFigure, titleParts } from './balanceCopy'
import { fewEffortsText, missingText } from './balanceMissing'
import { BalanceLede } from './BalanceLede'
import { PAGE_HEADING_ID } from './pageHeading'

export interface BalanceHeroProps {
  result: AnalysisResult
  /** Every activity in the library, so an empty period can say what it leaves out. */
  library: ActivitySummary[]
  /** The energy comparison the headline falls back to, or null when the sports cannot be compared yet. */
  pick: HeadlinePick | null
  /** The age-grade gap when both sports are graded. It is the headline and the scoreboard figure when present. */
  gap: BalanceGap | null
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
  /** The drawing under the answer: the level scale, when both sports are graded. Without it the meter is drawn. */
  scale?: ReactNode
  /** The level scale of the one sport on file, under the line that asks for the other; none when both are. */
  aloneScale?: ReactNode
  /** The period control, directly under the answer it changes, above the scale it redraws. */
  controls?: ReactNode
}

/**
 * The scoreboard: a headline that names the answer, a plain first sentence, and the gap as a display figure
 * labelled with its direction and range. The level scale beneath it is the visual; with grades missing, the
 * energy meter stands in. Where the two sports cannot be compared yet, the headline says what is missing.
 */
export function BalanceHero({
  result,
  library,
  pick,
  gap,
  period,
  onShowAll,
  weightKnown,
  action = null,
  runLevel = null,
  rideLevel = null,
  scale = null,
  aloneScale = null,
  controls = null,
}: BalanceHeroProps) {
  const phone = useNarrowScreen(BALANCE_PHONE_MAX_WIDTH_PX)
  const reading = weightKnown ? balanceOfPick(gap, pick) : null
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
        {action}
        {controls}
      </section>
    )
  }
  if (reading === null) {
    const { title, detail, canShowAll } = missingText(result, library, period, {
      run: runLevel,
      ride: rideLevel,
    })
    const answer = (
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
        {aloneScale === null ? action : null}
      </section>
    )
    if (aloneScale === null) {
      return (
        <div className="balance-hero__pair">
          {answer}
          {controls}
        </div>
      )
    }
    return (
      <div className="balance-hero__pair">
        {answer}
        {controls}
        {aloneScale}
        {action}
      </div>
    )
  }
  const { lead, sport, noun } = titleParts(reading)
  const figure = gapFigure(reading)
  const few = fewEffortsText(result)
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
              compact={phone}
            />
          </p>
          {few !== null && <p className="secondary">{few}</p>}
        </div>
        <div className="balance-hero__gap">
          <p className="balance-hero__figure">
            <span className="balance-hero__number">{figure.number}</span>
            <span className="balance-hero__unit">{figure.unit}</span>
          </p>
          <p className="muted balance-hero__note">
            <span className="balance-hero__side">{figure.side}</span>{' '}
            <span className="balance-hero__range">{figure.range}</span>
          </p>
        </div>
      </section>
      {controls}
      {scale ?? <BalanceMeter reading={reading} adjusted={pick?.calibrated ?? false} />}
      {action}
    </div>
  )
}
