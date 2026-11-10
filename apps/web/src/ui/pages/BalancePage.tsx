import { useMemo, type ReactNode } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { ShareImageButton } from '../components'
import { useHoldInputs } from '../holdContext'
import { heldPick } from '../resultHold'
import { balanceOfPick } from '../components/balanceScale'
import { previousPeriodLabel } from '../components/rangeOptions'
import { formatMonths } from '../format/date'
import { levelTarget, targetRows } from '../levelTarget'
import { NO_ROWS } from '../components/property'
import type { Property } from '../components/property'
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
import { triangleViewOf } from '../triangleSports'
import type { AnalysisController } from '../useAnalysis'
import { balanceChanges } from './balanceChangeItems'
import { BalanceChanges } from './BalanceChanges'
import { BalanceHero } from './BalanceHero'
import { BalanceTiles } from './BalanceTiles'
import { FitnessAndCheckIn } from './FitnessAndCheckIn'
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
  /** The period's status and Custom form, shown under the answer it changes. */
  controls: ReactNode
  /** The period's dates, counts and notes as rows, for the Details under the answer. */
  periodRows?: readonly Property[]
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
  periodRows = NO_ROWS,
  weightKnown,
  onShowAll,
  footnote = null,
  leftOut,
}: BalancePageProps) {
  const {
    isSample,
    period,
    library: allActivities,
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
  // The level triangle: each sport's grade on its own corner. It holds back only while the weight is asked for, which the hero says.
  const triangle = useMemo(() => triangleViewOf(grades), [grades])
  const weightHeld = !weightKnown && inPeriod.run > 0 && inPeriod.ride > 0
  const levelShown =
    !weightHeld && Object.values(triangle.grades).some((corner) => corner.kind === 'graded')
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
  // The standards line is shown only when a grade is on screen, so it never cites grades that are not
  // there: a ride's grade is on screen only once the weight is entered.
  const gradeShown = gradedSexOf(headline, profile, weightKnown) !== null
  // A library of one sport is that sport's home: no comparison slots, an invitation to add the other at the foot.
  const only = soleSportOf(library)
  const soleSport = only !== null && inPeriod[only] > 0 ? only : null
  // The Details under the answer: the period, the level target, and the standards the grades are read against, which are
  // shown only when a grade is on screen, so they never cite grades that are not there.
  const details: Property[] = [
    ...periodRows,
    ...(target === null ? [] : targetRows(target)),
    ...(gradeShown ? [{ label: 'Graded on', value: ROAD_STANDARDS_SOURCE.shortName }] : []),
  ]

  return (
    <div className="page-stack balance-page">
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
        rideLeftOut={rideOut}
        triangle={triangle}
        controls={controls}
        details={details}
        leftOut={leftOut}
        action={
          <ShareImageButton
            result={result}
            settings={settings}
            units={units}
            period={period}
            isSample={isSample}
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
        levelShown={levelShown}
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
      />

      {soleSport === null ? null : (
        <SportInvitation sport={soleSport} onAddFiles={analysis.addFiles} />
      )}

      {footnote}
    </div>
  )
}
