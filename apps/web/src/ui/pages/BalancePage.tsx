import { useMemo, type ReactNode } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { ShareImageButton } from '../components/ShareImageButton'
import { useHoldInputs } from '../holdContext'
import { heldPick } from '../resultHold'
import { balanceOfPick } from '../components/balanceScale'
import { standingOf } from '../standing'
import { withoutWalking } from '../analysis/walkingPaceCopy'
import type { LeftOutRuns } from '../analysis/walkingPaceCopy'
import { countSport } from '../records'
import { gradeLevelText } from '../grades'
import type { AgeGap, AgeProfile, GradeOutcome } from '../grades'
import { gradesOfStanding } from '../thresholdGrade'
import { hrefFor } from '../route'
import { holdWithRideOut, rideLeftOut } from '../rideLeftOut'
import { soleSportOf } from '../soleSport'
import { triangleViewOf } from '../triangleSports'
import { liftTileOf } from '../lift/liftTile'
import { headlineHalf, raceAnswerFor } from '../raceAnswer'
import { halfForecastOf } from '../runHalf'
import { useLiftResults } from '../lift/useLiftResults'
import type { LiftSummaryAccount } from '../lift/useLiftResults'
import type { BalanceView } from '../analysis/views'
import { BalanceHero } from './BalanceHero'
import { BalanceTiles } from './BalanceTiles'
import { CheckInLine } from './CheckInLine'
import { LevelsSection } from './LevelsSection'
import { SoleSportRecords } from './SoleSportRecords'
import { SportInvitation } from './SportInvitation'
import './BalancePage.css'

export interface BalancePageProps {
  analysis: BalanceView
  result: AnalysisResult
  settings: AthleteSettings
  units: UnitSystem
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The year of birth or sex the grades still need, which the prompt names; null when both are given. */
  missingAge: AgeGap | null
  /** The period's status and Custom form, shown under the answer it changes. */
  controls: ReactNode
  /** False while no body weight is entered, so the share card leaves out what needs one. */
  weightKnown: boolean
  /** The line that says what the page is based on, at its foot. */
  footnote?: ReactNode
  /** Picks All time the way the period control does, so the choice is kept. */
  onShowAll: () => void
  /** Runs that are all at walking pace and left out, which the page says instead of that it has no runs. */
  leftOut?: LeftOutRuns
  /** Who is signed in, so the lifting corner reads the same sets as the Lift page; signed out when not given. */
  liftAccount?: LiftSummaryAccount
}

const SIGNED_OUT_LIFTS: LiftSummaryAccount = { status: 'signed-out', userId: null }

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
  liftAccount = SIGNED_OUT_LIFTS,
}: BalancePageProps) {
  const { isSample, period, library: allActivities } = analysis.state
  // What the analysis rests on: the runs at walking pace are in the lists, not in what this page counts and dates.
  const library = useMemo(() => withoutWalking(allActivities), [allActivities])
  const hold = useHoldInputs()
  // The run's row leads with the half marathon the Run page predicts, asked the same way, when it is a forecast; the share
  // card leads with the same one, and the run is graded by it (`halfForecastOf`), so its row, level and corner are one figure.
  const { heartRateJudgement } = analysis.state
  const half = useMemo(
    () =>
      headlineHalf(
        raceAnswerFor('run', {
          result,
          rangeDays: period.days,
          library,
          heartRateJudgement,
          periodEndMs: period.endMs,
        }),
      ),
    [result, period.days, period.endMs, library, heartRateJudgement],
  )
  const runHalf = useMemo(
    () => halfForecastOf(half, { result, periodEndMs: period.endMs }),
    [half, result, period.endMs],
  )
  // Where the athlete stands, worked out once by core (`sportStanding`): a run's grade is its forecast half's, a ride's its threshold's, and
  // the lead, the ride as a run and the level target come with it. The cards, the balance and the share card all read it. It is
  // memoised on the analysis and the two profile values, not the profile object, which the caller builds afresh on each render.
  // The share preview is drawn from it, so a new object each render would redraw it while the sheet is open.
  const birthYear = profile?.birthYear ?? null
  const sex = profile?.sex ?? null
  const standing = useMemo(
    () =>
      birthYear === null || sex === null
        ? null
        : standingOf(result, { birthYear, sex }, { massKg: settings.massKg, units }, runHalf),
    [result, birthYear, sex, settings.massKg, units, runHalf],
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
  // held with it. This is the one gate: the headline and the tiles read it.
  const reading = useMemo(
    () => (weightKnown ? balanceOfPick(gap, pick) : null),
    [weightKnown, gap, pick],
  )
  const runCount = countSport(result.activities, 'run')
  const rideCount = countSport(result.activities, 'ride')
  const inPeriod = useMemo<Record<Sport, number>>(
    () => ({ run: runCount, ride: rideCount }),
    [runCount, rideCount],
  )
  // Lifting's corner and row, from the lift results (`useLiftResults`): the server's for an account, core's over this browser's log
  // signed out. The sample library is someone else's, so it shows no lifts of this browser's. A grade waits for the weight and the
  // age: until then the results say which is missing (a `gap`), and the corner draws none.
  const liftResults = useLiftResults(liftAccount, settings)
  const liftShown = isSample ? null : liftResults
  const liftGrade = liftShown?.corner ?? null
  const liftTile = useMemo(() => liftTileOf(liftShown, units), [liftShown, units])
  // The level triangle: each sport's grade on its own corner. It holds back only while the weight is asked for, which the hero says.
  const triangle = useMemo(() => triangleViewOf(grades, liftGrade), [grades, liftGrade])
  const weightHeld = !weightKnown && inPeriod.run > 0 && inPeriod.ride > 0
  const levelShown =
    !weightHeld && Object.values(triangle.grades).some((corner) => corner.kind === 'graded')
  // A library of one sport is that sport's home: no comparison slots, an invitation to add the other at the foot.
  const only = soleSportOf(library)
  const soleSport = only !== null && inPeriod[only] > 0 ? only : null
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
            triangle={triangle}
            half={half}
            lift={liftTile}
            disabled={analysis.busy}
          />
        }
      />

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
        lift={liftTile}
        half={half}
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

      {/* The balance leads the home page; the import line sits after the period's tiles and before the levels. Fitness is on
          the Run and Ride pages. */}
      <CheckInLine analysis={analysis} units={units} />

      {levelShown ? <LevelsSection grades={triangle.grades} /> : null}

      {soleSport === null ? null : (
        <SportInvitation sport={soleSport} onAddFiles={analysis.addFiles} />
      )}

      {footnote}
    </div>
  )
}
