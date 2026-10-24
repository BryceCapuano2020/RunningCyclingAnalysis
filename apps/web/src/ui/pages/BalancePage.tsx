import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { trendWindowDays, weeksWithValue } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SharedTrendChart, energyWeeks, gradeWeeks } from '../charts'
import { ShareImageButton, pickHeadline } from '../components'
import { StandardsCredit } from '../components/StandardsCredit'
import { gapOfHeadline } from '../balanceGap'
import { AGE_RANGE_TEXT, athleteOf, gradedSexOf, headlineGrades, SEX_NOUN } from '../grades'
import type { AgeProfile } from '../grades'
import { hrefFor } from '../route'
import { SPORT_ORDER } from '../sports'
import type { AnalysisController } from '../useAnalysis'
import { BalanceHero } from './BalanceHero'
import { CrossSportCard } from './CrossSportCard'
import { EvidenceCard } from './EvidenceCard'
import { SportCard } from './SportCard'
import './BalancePage.css'

export interface BalancePageProps {
  analysis: AnalysisController
  result: AnalysisResult
  settings: AthleteSettings
  units: UnitSystem
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The period control, shown beside the heading. */
  controls: ReactNode
  /** False while no body weight is entered, so the share card leaves out what needs one. */
  weightKnown: boolean
  /** The line that says what the page is based on, at its foot. */
  footnote?: ReactNode
}

/**
 * Whether any week of the trend falls at an age the standards cover. When none does, the grade
 * trend has nothing to show, and the page says which ages the standards cover instead. Without a
 * profile there is no age to grade by, so there is nothing to say.
 */
function gradesCoverAge(trend: readonly TrendPoint[], profile: AgeProfile | null): boolean {
  if (profile === null) return true
  // Each sport is graded at the age on its own best effort's day, so the test uses those days.
  return trend.some((point) =>
    [point.runAtMs, point.rideAtMs].some(
      (atMs) => atMs !== null && athleteOf(profile, atMs) !== null,
    ),
  )
}

/**
 * The home screen. It answers three things at a glance: where you stand in each sport, how your
 * balance between them leans, and what would sharpen the answer.
 */
export function BalancePage({
  analysis,
  result,
  settings,
  units,
  profile,
  controls,
  weightKnown,
  footnote = null,
}: BalancePageProps) {
  const { isSample, rangeDays, trend } = analysis.state
  const pick = pickHeadline(result.comparison)
  const effort = result.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  // Each sport's grade is worked out once here, and the cards, the balance and the share card share it.
  const headline = profile === null ? null : headlineGrades(result, profile)
  // The ride's grade, and so the gap, wait for the weight; the run's grade does not.
  const gap = weightKnown && headline !== null ? gapOfHeadline(headline) : null
  // The standards line is shown only when a grade is on screen, so it never cites grades that are not
  // there: a ride's grade is on screen only once the weight is entered.
  const sourceSex = gradedSexOf(headline, profile, weightKnown)
  // A ride is named as graded only when its grade is on screen, which waits for the weight.
  const rideGraded = weightKnown && headline?.ride.kind === 'graded'

  return (
    <div className="page-stack">
      <div className="page-head">
        <p className="eyebrow">
          Your balance
          {isSample && <span className="chip">Sample athlete</span>}
        </p>
        {controls}
      </div>

      <BalanceHero
        result={result}
        pick={pick}
        gap={gap}
        rangeDays={rangeDays}
        onShowAll={() => analysis.setRange(null)}
        weightKnown={weightKnown}
      />

      <div className="balance__sports">
        {SPORT_ORDER.map((sport) => (
          <SportCard
            key={sport}
            sport={sport}
            result={result}
            units={units}
            massKg={settings.massKg}
            grade={headline?.[sport] ?? null}
            weighted={weightKnown}
          />
        ))}
      </div>

      {profile === null && (
        <div className="balance__profile">
          <p className="muted">
            The balance in points and levels needs your year of birth and sex.
          </p>
          <a className="btn" href={hrefFor({ page: 'profile' })}>
            Add year of birth and sex
          </a>
        </div>
      )}

      <div className="balance__cards">
        <EvidenceCard effort={effort} />
        <CrossSportCard result={result} units={units} weighted={weightKnown} />
      </div>

      {weeksWithValue(trend) >= 2 && (
        <section className="section" aria-labelledby="balance-trend">
          <h2 id="balance-trend">Fitness over time</h2>
          <div className="balance__trends">
            {/* One trend for both sports, on one scale: age grades when the age and sex are known. */}
            <SharedTrendChart
              weeks={profile === null ? energyWeeks(trend) : gradeWeeks(trend, profile)}
              measure={profile === null ? 'energy' : 'grade'}
              windowDays={trendWindowDays(rangeDays)}
              effortS={HEADLINE_DURATION_S}
              emptyText={gradesCoverAge(trend, profile) ? undefined : AGE_RANGE_TEXT}
              rideKnown={weightKnown}
            />
          </div>
        </section>
      )}

      <div className="balance__footer">
        <ShareImageButton
          result={result}
          settings={settings}
          units={units}
          rangeDays={rangeDays}
          isSample={isSample}
          effort={effort}
          weightKnown={weightKnown}
          gap={gap}
          disabled={analysis.busy}
        />
      </div>

      {sourceSex !== null && (
        <p className="muted balance__source">
          Graded on the <StandardsCredit />, for a {SEX_NOUN[sourceSex]}. Age is counted from your
          birth year on the date of each effort.
          {rideGraded && ' Rides are graded through their running equivalent.'} A level, not a
          ranking.
        </p>
      )}
      {footnote}
    </div>
  )
}
