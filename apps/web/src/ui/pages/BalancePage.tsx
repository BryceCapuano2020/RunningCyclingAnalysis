import { useMemo, type ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { trendWindowDays, weeksWithValue } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SharedTrendChart, WeeklyVolumeChart } from '../charts'
import { copyOf } from '../charts/sharedTrendText'
import { windowPhrase } from '../charts/trendText'
import { ShareImageButton, headlinePick } from '../components'
import { balanceOfPick } from '../components/balanceScale'
import { previousPeriodLabel } from '../components/rangeOptions'
import { gapOfHeadline } from '../balanceGap'
import { levelTarget } from '../levelTarget'
import { withoutWalking } from '../analysis/walkingPaceCopy'
import { countSport, latestStartOf } from '../records'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import {
  AGE_RANGE_TEXT,
  HEADLINE_LABEL,
  LEVEL_NOT_RANKING,
  ageAndSexAt,
  gradedSexOf,
  headlineGrades,
  SEX_NOUN,
} from '../grades'
import type { AgeGap, AgeProfile, GradeOutcome } from '../grades'
import { hrefFor } from '../route'
import { SPORT_ORDER } from '../sports'
import type { AnalysisController } from '../useAnalysis'
import { volumeCaption } from '../volumeCaption'
import { balanceChanges } from './balanceChangeItems'
import { balanceLevels } from './levelsModel'
import { BalanceChanges } from './BalanceChanges'
import { BalanceHero } from './BalanceHero'
import { BalanceLevels } from './BalanceLevels'
import { BalanceTiles } from './BalanceTiles'
import { EvidenceLine } from './EvidenceLine'
import { useBalanceTrend } from './useBalanceTrend'
import { GradeProfileSection } from './GradeProfileSection'
import './BalancePage.css'

export interface BalancePageProps {
  analysis: AnalysisController
  result: AnalysisResult
  settings: AthleteSettings
  units: UnitSystem
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The year of birth or sex the grades still need, which the prompt names; null when both are given. */
  missingAge: AgeGap | null
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
      (atMs) => atMs !== null && ageAndSexAt(profile, atMs) !== null,
    ),
  )
}

/**
 * The fitness trend's name: the chart's own title, from the same measure, effort and window it draws
 * with, so the section and the chart name it in the same words.
 */
function trendTitleOf(period: Period): string {
  const windowText = windowPhrase(trendWindowDays(period.days))
  return copyOf(HEADLINE_LABEL, windowText).title
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
  missingAge,
  controls,
  weightKnown,
  onShowAll,
  footnote = null,
}: BalancePageProps) {
  const {
    isSample,
    period,
    library: allActivities,
    trend,
    previous,
    heartRateJudgement,
  } = analysis.state
  // What the analysis rests on: the runs at walking pace are in the lists, not in what this page counts and dates.
  const library = useMemo(() => withoutWalking(allActivities), [allActivities])
  // The calibration every period's equivalents were priced with, which the grade chart and the level target use too.
  const { calibration } = heartRateJudgement
  const pick = headlinePick(result)
  const effort = result.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  // Each sport's grade is worked out once here, and the cards, the balance and the share card share it.
  // They are memoised on the analysis and the two profile values, not the profile object, which the
  // caller builds afresh on each render. The share preview is drawn from them, so a new object each
  // render would redraw it while the sheet is open.
  const birthYear = profile?.birthYear ?? null
  const sex = profile?.sex ?? null
  const headline = useMemo(
    () => (birthYear === null || sex === null ? null : headlineGrades(result, { birthYear, sex })),
    [result, birthYear, sex],
  )
  // The ride's grade, and so the gap, wait for the weight; the run's grade does not.
  const gap = useMemo(
    () => (weightKnown && headline !== null ? gapOfHeadline(headline) : null),
    [weightKnown, headline],
  )
  const grades = useMemo<Record<Sport, GradeOutcome | null>>(
    () => ({
      run: headline?.run ?? null,
      ride: weightKnown ? (headline?.ride ?? null) : null,
    }),
    [headline, weightKnown],
  )
  // The balance is stated once the headline can compare the sports; without a pick it is held, and the gap is
  // held with it. This is the one gate: the headline, the tiles, the level target and the changes all read it.
  const reading = useMemo(
    () => (weightKnown ? balanceOfPick(gap, pick) : null),
    [weightKnown, gap, pick],
  )
  const heldGap = pick === null ? null : gap
  // The lean tile and the target are in points, which only a grade gap gives; an energy balance has none.
  const pointsReading = reading?.unit === 'points' ? reading : null
  // The level target waits for the same things as the balance: both grades, and so the weight. Its ride
  // search runs on each change of these inputs, not on each render, so it is memoised on them.
  const target = useMemo(
    () =>
      heldGap !== null && sex !== null
        ? levelTarget({
            lean: heldGap.lean,
            grades,
            result,
            sex,
            massKg: settings.massKg,
            units,
            calibration,
          })
        : null,
    [heldGap, grades, result, sex, settings.massKg, units, calibration],
  )
  const runCount = countSport(result.activities, 'run')
  const rideCount = countSport(result.activities, 'ride')
  const inPeriod = useMemo<Record<Sport, number>>(
    () => ({ run: runCount, ride: rideCount }),
    [runCount, rideCount],
  )
  // The levels under the meter: both sports with the balance. With one sport in the period, its level stands alone
  // when it has one; with two but no balance, the headline already names the levels.
  const hasReading = reading !== null
  const levels = useMemo(() => {
    const sports = SPORT_ORDER.filter((sport) => hasReading || inPeriod[sport] > 0)
    if (!hasReading && sports.length !== 1) return null
    const model = balanceLevels({ grades, sports, inPeriod, missingAge })
    return !hasReading && model.rows.every((row) => row.grade === null) ? null : model
  }, [hasReading, grades, inPeriod, missingAge])
  // What moved since the previous period, graded as this period is; the previous gap is priced once here.
  const previousLabel = previousPeriodLabel(period.days)
  const changes = useMemo(
    () =>
      balanceChanges({
        result,
        previous,
        library,
        previousLabel,
        units,
        rideShown: weightKnown,
        gap: heldGap,
        grading:
          profile === null
            ? null
            : {
                library,
                profile: { birthYear: profile.birthYear, sex: profile.sex },
                massKg: settings.massKg,
                calibration,
              },
      }),
    [
      result,
      previous,
      library,
      previousLabel,
      units,
      weightKnown,
      heldGap,
      profile,
      settings.massKg,
      calibration,
    ],
  )
  const { volume, trendWeeks, axis, gutter } = useBalanceTrend({
    trend,
    activities: result.activities,
    periodStartMs: period.startMs,
    profile,
    weightKnown,
  })
  // The standards line is shown only when a grade is on screen, so it never cites grades that are not
  // there: a ride's grade is on screen only once the weight is entered.
  const sourceSex = gradedSexOf(headline, profile, weightKnown)
  // With one sport in the period, the comparison slots say nothing, so they are left out.
  const bothInPeriod = runCount > 0 && rideCount > 0
  // A ride is named as graded only when its grade is on screen, which waits for the weight.
  const rideGraded = grades.ride?.kind === 'graded'
  // Each grade is at the age on its own effort's day, so the footer names both ages when they differ.
  const runAge = grades.run?.kind === 'graded' ? grades.run.age : null
  const rideAge = grades.ride?.kind === 'graded' ? grades.ride.age : null
  const age = runAge ?? rideAge
  // The source line sits under the cards it grades, not under the trend beneath them.
  const sourceLine =
    sourceSex !== null && age !== null ? (
      <p className="muted balance__source">
        {runAge !== null && rideAge !== null && runAge !== rideAge
          ? `Graded for a ${SEX_NOUN[sourceSex]} aged ${runAge} on runs and ${rideAge} on rides, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
          : `Graded for a ${age}-year-old ${SEX_NOUN[sourceSex]} on the ${ROAD_STANDARDS_SOURCE.shortName}.`}
        {rideGraded && ' Rides are graded through their running equivalent.'}
        {` ${LEVEL_NOT_RANKING}`}
      </p>
    ) : null

  return (
    <div className="page-stack">
      <BalanceHero
        result={result}
        library={library}
        pick={pick}
        reading={reading}
        period={period}
        onShowAll={onShowAll}
        weightKnown={weightKnown}
        runLevel={gradedLevel(grades.run)}
        rideLevel={gradedLevel(grades.ride)}
        levels={levels === null ? null : <BalanceLevels model={levels} />}
        controls={controls}
        action={
          <ShareImageButton
            result={result}
            settings={settings}
            units={units}
            period={period}
            isSample={isSample}
            effort={effort}
            weightKnown={weightKnown}
            gap={gap}
            grades={grades}
            disabled={analysis.busy}
          />
        }
      />

      <BalanceChanges changes={changes} previousLabel={previousLabel} />

      <BalanceTiles
        result={result}
        library={library}
        units={units}
        massKg={settings.massKg}
        grades={grades}
        weighted={weightKnown}
        period={period}
        reading={pointsReading}
        target={target?.sentence ?? null}
        onAddFiles={analysis.addFiles}
      />

      {sourceLine}

      {missingAge !== null && (
        <div className="balance__profile">
          <p className="muted">{`The balance in points and levels needs your ${missingAge}.`}</p>
          <a className="btn" href={hrefFor({ page: 'profile' })}>
            {`Add your ${missingAge}`}
          </a>
        </div>
      )}

      {bothInPeriod && <EvidenceLine noHeartRate={result.maxHeartRate === null} />}

      <GradeProfileSection
        result={result}
        profile={profile}
        massKg={settings.massKg}
        weightKnown={weightKnown}
        calibration={calibration}
      />

      {weeksWithValue(trend) >= 1 && (
        <section className="section" aria-labelledby="balance-trend">
          {/* The chart's own title, shown once by the chart; the heading names the section the same way. */}
          <h2 id="balance-trend" className="sr-only">
            {trendTitleOf(period)}
          </h2>
          <div className="balance__trends">
            {/* One trend for both sports, on one scale: age grades when the age and sex are known. */}
            <SharedTrendChart
              weeks={trendWeeks}
              axis={axis}
              windowDays={trendWindowDays(period.days)}
              effortS={HEADLINE_DURATION_S}
              emptyText={
                profile === null
                  ? `Add your ${missingAge ?? 'year of birth and sex'} to see how your grade has moved.`
                  : gradesCoverAge(trend, profile)
                    ? undefined
                    : AGE_RANGE_TEXT
              }
              rideKnown={weightKnown}
              latestStartMs={{
                run: latestStartOf(library, 'run'),
                ride: latestStartOf(library, 'ride'),
              }}
            />
            {/* The hours behind the trend, on its time axis: where the balance moved because training did. */}
            {volume === null ? null : (
              <WeeklyVolumeChart
                weeks={volume}
                lede={volumeCaption(volume)}
                plotRightMargin={gutter}
                axis={axis}
              />
            )}
          </div>
        </section>
      )}

      {footnote}
    </div>
  )
}
