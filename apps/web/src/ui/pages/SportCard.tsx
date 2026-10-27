import { useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { AgeGradeBlock } from '../components/AgeGradeBlock'
import { SportRecords } from '../components/SportRecords'
import { recordRow } from '../recordRow'
import { WeightNote } from '../components/WeightNote'
import { ArrowRightIcon, SportIcon } from '../components/icons'
import { SPORT_NOTE } from '../grades'
import type { GradeOutcome } from '../grades'
import { COMPACT_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { hrefFor } from '../route'
import { useNarrowScreen } from '../useNarrowScreen'
import {
  SPORT_LABEL,
  SPORT_PLURAL,
  THRESHOLD_LABEL,
  THRESHOLD_MEANING,
  thresholdNeedsText,
} from '../sports'
import {
  CHIP_DURATIONS_S,
  effortLabel,
  headlineEffort,
  refusalOf,
  sportRecords,
  threshold,
} from '../records'
import './SportCard.css'

export interface SportCardProps {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  /**
   * The sport's grade at the headline duration. Null while the year of birth or the sex is missing,
   * and the Balance page asks for them once rather than on each card.
   */
  grade: GradeOutcome | null
  /** False while no body weight is entered; a ride's figures then wait for it. */
  weighted: boolean
}

/**
 * One sport at a glance: the estimated threshold as the hero number, its age grade, and the best
 * efforts that show it, each naming the activity that set it. A ride's figures wait for the weight.
 */
export function SportCard({ sport, result, units, massKg, grade, weighted }: SportCardProps) {
  const headingId = `sport-card-${sport}`
  const narrow = useNarrowScreen(COMPACT_PHONE_MAX_WIDTH_PX)
  // The breakpoint sets the disclosure until the visitor opens or closes it; their choice then holds.
  const [chosen, setChosen] = useState<boolean | null>(null)
  const recordsOpen = chosen ?? !narrow
  // A ride's figures use the body mass, so they are held until it is entered; a run's are not.
  const held = sport === 'ride' && !weighted
  const hero = held ? null : threshold(result, sport, massKg, units)
  const records = held
    ? []
    : sportRecords(result, sport, massKg, units).filter((record) =>
        CHIP_DURATIONS_S.includes(record.durationS),
      )
  const effort = headlineEffort(sport, records)

  return (
    <section
      className={`card sport-card sport-card--${sport}`}
      data-sport={sport}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="sport-card__name">
        <SportIcon sport={sport} />
        {SPORT_LABEL[sport]}
      </h2>
      <>
        <div className="sport-card__hero">
          {held ? (
            <WeightNote />
          ) : (
            <>
              <p className="eyebrow">{THRESHOLD_LABEL[sport]}</p>
              {hero ? (
                <p>
                  <span className="hero-number">
                    {hero.number}
                    <span className="hero-number__unit"> {hero.unit}</span>
                  </span>
                  {hero.sub && (
                    <>
                      {/* Hidden space: the sub-line sits apart on screen, and reads apart in the text too. */}
                      <span className="sr-only"> </span>
                      <span className="sport-card__sub">{hero.sub}</span>
                    </>
                  )}
                </p>
              ) : (
                <p className="secondary">{thresholdNeedsText(refusalOf(result, sport))}</p>
              )}
              {hero && <p className="muted">{THRESHOLD_MEANING[sport]}</p>}
            </>
          )}
        </div>
        {!held && grade && (
          <AgeGradeBlock sport={sport} outcome={grade} effort={effort} namesStandard={false} />
        )}
        {/* On a phone the records fold away, so the card's answer and its ladder read first. */}
        {records.length > 0 && (
          <details className="sport-card__records" open={recordsOpen}>
            {/* The choice is taken on the click, which is synchronous, not on the toggle event after it. The
                press is cancelled so the browser's own toggle does not open or shut it a second time. */}
            <summary
              onClick={(event) => {
                event.preventDefault()
                setChosen(!recordsOpen)
              }}
            >
              Best efforts
            </summary>
            <SportRecords
              rows={records.map((record) =>
                recordRow(sport, record, {
                  label: effortLabel(record.durationS),
                  grade: null,
                }),
              )}
            />
            {SPORT_NOTE[sport] && <p className="muted">{SPORT_NOTE[sport]}</p>}
          </details>
        )}
      </>
      <a className="link-arrow" href={hrefFor({ page: sport })}>
        {`All ${SPORT_PLURAL[sport]}`}
        <ArrowRightIcon />
      </a>
    </section>
  )
}
