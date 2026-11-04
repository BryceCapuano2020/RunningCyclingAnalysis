import { useMemo, type ReactNode } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { WeeklyVolumeChart } from '../charts'
import { ShareImageButton } from '../components'
import { Definition } from '../components/Definition'
import { useHoldInputs } from '../holdContext'
import { heldPick } from '../resultHold'
import { balanceOfPick } from '../components/balanceScale'
import { previousPeriodLabel } from '../components/rangeOptions'
import { formatMonths } from '../format/date'
import { levelTarget } from '../levelTarget'
import { standingOf } from '../standing'
import { withoutWalking } from '../analysis/walkingPaceCopy'
import type { LeftOutRuns } from '../analysis/walkingPaceCopy'
import { countSport } from '../records'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { gradeLevelText, gradedSexOf } from '../grades'
import type { AgeGap, AgeProfile, GradeOutcome } from '../grades'
import { gradesOfStanding } from '../thresholdGrade'
import { hrefFor } from '../route'
import { holdWithRideOut, rideLeftOut } from '../rideLeftOut'
import { soleSportOf } from '../soleSport'
import { BALANCE_PAIR } from '../sports'
import type { AnalysisController } from '../useAnalysis'
import { balanceChanges } from './balanceChangeItems'
import { DEFINITIONS } from './balanceDefinitions'
import { balanceLevels } from './levelsModel'
import { BalanceChanges } from './BalanceChanges'
import { BalanceHero } from './BalanceHero'
import { BalanceLevels } from './BalanceLevels'
import { BalanceOverYears } from './BalanceOverYears'
import { BalanceTiles } from './BalanceTiles'
import { EvidenceLine } from './EvidenceLine'
import { FitnessAndCheckIn } from './FitnessAndCheckIn'
import { useBalanceVolume } from './useBalanceVolume'
import { GradeProfileSection } from './GradeProfileSection'
import { SoleSportRecords } from './SoleSportRecords'
import { SportInvitation } from './SportInvitation'
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
  /** Runs that are all at walking pace and left out, which the page says instead of that it has no runs. */
  leftOut?: LeftOutRuns
}

/** The level a sport's grade names, or null when the grade is not shown. */
function gradedLevel(outcome: GradeOutcome | null): string | null {
  return outcome?.kind === 'graded' ? gradeLevelText(outcome.grade) : null
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
  leftOut,
}: BalancePageProps) {
  const {
    isSample,
    period,
    library: allActivities,
    trend,
    previous: periodBefore,
    change: changeBefore,
    earlier,
  } = analysis.state
  // What the analysis rests on: the runs at walking pace are in the lists, not in what this page counts and dates.
  const library = useMemo(() => withoutWalking(allActivities), [allActivities])
  const hold = useHoldInputs()
  // Where the athlete stands, worked out once by core (`sportStanding`): each sport's grade is its threshold graded as an hour, and
  // the lead, the ride as a run and the level target come with it. The cards, the balance and the share card all read it. It is
  // memoised on the analysis and the two profile values, not the profile object, which the caller builds afresh on each render.
  // The share preview is drawn from it, so a new object each render would redraw it while the sheet is open.
  const birthYear = profile?.birthYear ?? null
  const sex = profile?.sex ?? null
  const standing = useMemo(
    () =>
      birthYear === null || sex === null
        ? null
        : standingOf(result, { birthYear, sex }, { massKg: settings.massKg, units }),
    [result, birthYear, sex, settings.massKg, units],
  )
  const headline = useMemo(
    () => (standing === null ? null : gradesOfStanding(result, standing)),
    [result, standing],
  )
  // The ride's grade, and so the gap, wait for the weight; the run's grade does not.
  const gap = weightKnown ? (standing?.lead ?? null) : null
  const grades = useMemo<Record<Sport, GradeOutcome | null>>(
    () => ({
      run: headline?.run ?? null,
      ride: weightKnown ? (headline?.ride ?? null) : null,
    }),
    [headline, weightKnown],
  )
  // A ride at the top of the age tables is left out of the comparison, so the energy view cannot carry it in.
  const rideOut = rideLeftOut(grades.ride, result)
  const { pick } = heldPick(result, holdWithRideOut(rideOut, hold))
  const effort = result.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  // The balance is stated once the headline can compare the sports; without a pick it is held, and the gap is
  // held with it. This is the one gate: the headline, the tiles, the level target and the changes all read it.
  const reading = useMemo(
    () => (weightKnown ? balanceOfPick(gap, pick) : null),
    [weightKnown, gap, pick],
  )
  const heldGap = pick === null ? null : gap
  // The level target, a line of the hero, waits for the same things as the balance: both grades, and so the weight.
  const target = useMemo(
    () =>
      heldGap === null || standing === null
        ? null
        : levelTarget(standing.match.run ?? standing.match.ride, units),
    [heldGap, standing, units],
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
    const sports = BALANCE_PAIR.filter((sport) => hasReading || inPeriod[sport] > 0)
    if (!hasReading && sports.length !== 1) return null
    const model = balanceLevels({ grades, sports, inPeriod, missingAge })
    return !hasReading && model.rows.every((row) => row.grade === null) ? null : model
  }, [hasReading, grades, inPeriod, missingAge])
  // What moved since the previous period, or since the latest earlier window when the previous one holds too little to
  // test; graded as this period is, and the previous gap is priced once here.
  const previous = earlier?.previous ?? periodBefore
  const change = earlier?.change ?? changeBefore
  const previousLabel =
    earlier === null
      ? previousPeriodLabel(period.days)
      : formatMonths(earlier.startMs, earlier.endMs, period.endMs ?? earlier.endMs)
  const changes = useMemo(
    () =>
      balanceChanges({
        result,
        previous,
        previousLabel,
        change,
        units,
        rideShown: weightKnown,
      }),
    [result, previous, previousLabel, change, units, weightKnown],
  )
  const { volume, axis } = useBalanceVolume({
    trend,
    activities: result.activities,
    periodStartMs: period.startMs,
  })
  // The standards line is shown only when a grade is on screen, so it never cites grades that are not
  // there: a ride's grade is on screen only once the weight is entered.
  const gradeShown = gradedSexOf(headline, profile, weightKnown) !== null
  // A library of one sport is that sport's home: no comparison slots, an invitation to add the other at the foot.
  const only = soleSportOf(library)
  const soleSport = only !== null && inPeriod[only] > 0 ? only : null
  // With one sport in the period, the comparison slots say nothing, so they are left out.
  const bothInPeriod = runCount > 0 && rideCount > 0
  // The source line sits under the cards it grades, not under the trend beneath them, and is said once.
  const sourceLine = !gradeShown ? null : (
    <p className="muted balance__source">
      <Definition meaning={DEFINITIONS.ageGrade}>Age-graded</Definition>
      {` on ${ROAD_STANDARDS_SOURCE.shortName}.`}
    </p>
  )

  return (
    <div className="page-stack">
      <BalanceHero
        result={result}
        library={library}
        pick={pick}
        reading={reading}
        target={target?.sentence ?? null}
        period={period}
        onShowAll={onShowAll}
        weightKnown={weightKnown}
        runLevel={gradedLevel(grades.run)}
        rideLevel={gradedLevel(grades.ride)}
        rideLeftOut={rideOut}
        levels={levels === null ? null : <BalanceLevels model={levels} />}
        controls={controls}
        leftOut={leftOut}
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
        onAddFiles={analysis.addFiles}
        soleSport={soleSport}
        leftOut={leftOut}
        levelShown={levels !== null}
      />

      {sourceLine}

      <BalanceOverYears
        years={analysis.state.history.balance}
        profile={profile}
        missingAge={missingAge}
        weightKnown={weightKnown}
        placement="home"
      />

      {soleSport === null ? null : (
        <SoleSportRecords
          sport={soleSport}
          result={result}
          massKg={settings.massKg}
          units={units}
          profile={profile}
          library={library}
          weightKnown={weightKnown}
        />
      )}

      {missingAge !== null && (
        <div className="balance__profile">
          <p className="muted">
            {soleSport === null
              ? `The balance in points and levels needs your ${missingAge}.`
              : `Your level needs your ${missingAge}.`}
          </p>
          <a className="btn" href={hrefFor({ page: 'profile' })}>
            {`Add your ${missingAge}`}
          </a>
        </div>
      )}

      {bothInPeriod && <EvidenceLine />}

      {/* The balance leads the home page; fitness sits under it, after the period's tiles and before the grades. */}
      <FitnessAndCheckIn
        analysis={analysis}
        units={units}
        library={library}
        soleSport={soleSport}
      />

      <GradeProfileSection
        result={result}
        profile={profile}
        massKg={settings.massKg}
        weightKnown={weightKnown}
        lean={reading?.lean ?? null}
      />

      {volume === null ? null : (
        <section className="section" aria-labelledby="balance-volume">
          <h2 id="balance-volume" className="sr-only">
            Training hours
          </h2>
          {/* Hours are counted, not estimated, so this strip states what the weeks held and no change test is needed. */}
          <WeeklyVolumeChart weeks={volume} axis={axis} />
        </section>
      )}

      {soleSport === null ? null : (
        <SportInvitation sport={soleSport} onAddFiles={analysis.addFiles} />
      )}

      {footnote}
    </div>
  )
}
