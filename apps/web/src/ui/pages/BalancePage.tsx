import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { trendWindowDays, weeksWithValue } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SharedTrendChart, energyWeeks, gradeWeeks } from '../charts'
import { ShareImageButton, pickHeadline } from '../components'
import { gapOfHeadline } from '../balanceGap'
import { countSport } from '../records'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { AGE_RANGE_TEXT, athleteOf, gradedSexOf, headlineGrades, SEX_NOUN } from '../grades'
import type { AgeProfile, GradeOutcome } from '../grades'
import { hrefFor } from '../route'
import { SPORT_ORDER } from '../sports'
import type { AnalysisController } from '../useAnalysis'
import { BalanceHero } from './BalanceHero'
import { BalanceStrip } from './BalanceStrip'
import { CrossSportCard } from './CrossSportCard'
import { EmptySportCard } from './EmptySportCard'
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
  /** The period control, shown under the answer it changes. */
  controls: ReactNode
  /** False while no body weight is entered, so the share card leaves out what needs one. */
  weightKnown: boolean
  /** The line that says what the page is based on, at its foot. */
  footnote?: ReactNode
  /** Picks All time the way the period control does, so the choice is kept. */
  onShowAll: () => void
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

/** The level a sport's grade names, or null when the grade is not shown. */
function gradedLevel(outcome: GradeOutcome | null): string | null {
  return outcome?.kind === 'graded' ? outcome.grade.centre.level : null
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
  onShowAll,
  footnote = null,
}: BalancePageProps) {
  const { isSample, period, library, trend } = analysis.state
  const pick = pickHeadline(result.comparison)
  const effort = result.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  // Each sport's grade is worked out once here, and the cards, the balance and the share card share it.
  const headline = profile === null ? null : headlineGrades(result, profile)
  // The ride's grade, and so the gap, wait for the weight; the run's grade does not.
  const gap = weightKnown && headline !== null ? gapOfHeadline(headline) : null
  const grades: Record<Sport, GradeOutcome | null> = {
    run: headline?.run ?? null,
    ride: weightKnown ? (headline?.ride ?? null) : null,
  }
  // The standards line is shown only when a grade is on screen, so it never cites grades that are not
  // there: a ride's grade is on screen only once the weight is entered.
  const sourceSex = gradedSexOf(headline, profile, weightKnown)
  const counts = {
    run: countSport(result.activities, 'run'),
    ride: countSport(result.activities, 'ride'),
  }
  // With one sport in the period, the comparison slots say nothing, so they are left out.
  const bothInPeriod = counts.run > 0 && counts.ride > 0
  // A ride is named as graded only when its grade is on screen, which waits for the weight.
  const rideGraded = grades.ride?.kind === 'graded'
  // The age the footer names is the age on the first graded effort's day, as the level line says it.
  const gradedAge = [grades.run, grades.ride].find((outcome) => outcome?.kind === 'graded')
  const age = gradedAge?.kind === 'graded' ? gradedAge.age : null

  return (
    <div className="page-stack">
      <BalanceHero
        result={result}
        library={library}
        pick={pick}
        gap={gap}
        period={period}
        onShowAll={onShowAll}
        weightKnown={weightKnown}
        runLevel={gradedLevel(grades.run)}
        rideLevel={gradedLevel(grades.ride)}
        aside={
          <>
            {isSample && <span className="chip">Sample athlete</span>}
            <ShareImageButton
              result={result}
              settings={settings}
              units={units}
              period={period}
              isSample={isSample}
              effort={effort}
              weightKnown={weightKnown}
              gap={gap}
              disabled={analysis.busy}
            />
          </>
        }
      />

      <BalanceStrip grades={grades} />

      {controls}

      <div className="balance__sports">
        {SPORT_ORDER.map((sport) =>
          counts[sport] > 0 ? (
            <SportCard
              key={sport}
              sport={sport}
              result={result}
              units={units}
              massKg={settings.massKg}
              grade={grades[sport]}
              weighted={weightKnown}
            />
          ) : (
            <EmptySportCard
              key={sport}
              sport={sport}
              inLibrary={countSport(library, sport)}
              period={period}
              onAddFiles={analysis.addFiles}
            />
          ),
        )}
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

      {bothInPeriod && (
        <div className="balance__cards">
          <EvidenceCard effort={effort} />
          <CrossSportCard result={result} units={units} weighted={weightKnown} />
        </div>
      )}

      {weeksWithValue(trend) >= 2 && (
        <section className="section" aria-labelledby="balance-trend">
          <h2 id="balance-trend">Best 20 min, week by week</h2>
          <div className="balance__trends">
            {/* One trend for both sports, on one scale: age grades when the age and sex are known. */}
            <SharedTrendChart
              weeks={profile === null ? energyWeeks(trend) : gradeWeeks(trend, profile)}
              measure={profile === null ? 'energy' : 'grade'}
              windowDays={trendWindowDays(period.days)}
              effortS={HEADLINE_DURATION_S}
              emptyText={gradesCoverAge(trend, profile) ? undefined : AGE_RANGE_TEXT}
              rideKnown={weightKnown}
            />
          </div>
        </section>
      )}

      {sourceSex !== null && age !== null && (
        <p className="muted balance__source">
          {`Graded for a ${age}-year-old ${SEX_NOUN[sourceSex]} on the ${ROAD_STANDARDS_SOURCE.shortName}.`}
          {rideGraded && ' Rides are graded through their running equivalent.'}
          {' A level, not a ranking.'}
        </p>
      )}
      {footnote}
    </div>
  )
}
