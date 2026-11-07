import { useMemo, type ReactNode } from 'react'
import type { Sex } from '@rca/core/grade'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { previousPeriodLabel } from '../components/rangeOptions'
import { Shell } from '../components/Rail'
import { judgedDetail } from '../analysis/detailCoverage'
import { leftOutRuns, withoutWalking, workoutKeyOf } from '../analysis/walkingPaceCopy'
import { ageProfileOf, missingAgeOf } from '../grades'
import { countSport } from '../records'
import { countsOf, startedInPeriod } from '../activityCounts'
import { sportEmptyText } from '../periodCopy'
import { ActivityPage, HistoryPage } from '../lazyPages'
import type { Route } from '../route'
import type { AnalysisController } from '../useAnalysis'
import type { CountedRunsController } from '../useCountedRuns'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS, sampleProfileAt } from '../sampleAthlete'
import { ActivitiesPage } from './ActivitiesPage'
import { BalancePage } from './BalancePage'
import { ProfileFootnote } from '../components/ProfileFootnote'
import { aboutNotesOf, noteRow } from '../components/aboutNotes'
import { MethodPage } from './MethodPage'
import { askHeadingFocus, useHeadingFocusWhen } from './useHeadingFocus'
import { SportPage } from './SportPage'
import { keptIdsOf } from './keptIds'
import { useResultPeriod } from './useResultPeriod'

export interface ResultPageProps {
  route: Route
  analysis: AnalysisController
  result: AnalysisResult
  settings: AthleteSettings
  /** False while no body weight is entered; the results on screen and on the card then wait for one. */
  weightKnown: boolean
  units: UnitSystem
  birthYear: number | null
  sex: Sex | null
  /** Whether the visitor is signed in, which says where a removal takes an activity from. */
  signedIn: boolean
  /** The runs at walking pace the athlete counts as runs, and how to change that. */
  countedRuns: CountedRunsController
}

/** The page the route names, once there is a result to show. */
export function ResultPage({
  route,
  analysis,
  result,
  settings,
  weightKnown,
  units,
  birthYear,
  sex,
  signedIn,
  countedRuns,
}: ResultPageProps) {
  const { period, library, isSample } = analysis.state
  // What the analysis rests on: the library less the runs at walking pace, which only the lists and pages show.
  const analysed = useMemo(() => withoutWalking(library), [library])
  // The period's count is of every activity on file that started in it, counted or not: the same kind of number as
  // the total it is said out of, and as the Activities list gives.
  const inPeriod = useMemo(() => startedInPeriod(library, period), [library, period])
  // The runs at walking pace are left out; when they are all a sport has, its pages say so and offer to count them.
  const left = useMemo(() => leftOutRuns(library), [library])
  const leftOut = left.allLeftOut
    ? {
        sport: left.runs[0]!.sport,
        count: left.runs.length,
        onCount: () => {
          askHeadingFocus()
          countedRuns.count(left.runs.map(workoutKeyOf))
        },
      }
    : null
  // Counting them flips this page to the answer; once it has, focus goes to the heading, which names the new state.
  useHeadingFocusWhen(leftOut === null)
  // Each effort is graded at its own date, so the profile carries the year of birth, not an age.
  // The sample athlete has its own age, sex and masses, whatever the visitor has entered.
  const profile = isSample
    ? library[0]
      ? sampleProfileAt(library[0].startMs)
      : SAMPLE_PROFILE
    : ageProfileOf(birthYear, sex)
  // The prompt for a missing field names only that field; the sample has all of them.
  const missingAge = isSample ? null : missingAgeOf(birthYear, sex)
  const athleteSettings = isSample ? SAMPLE_SETTINGS : settings
  // The saved copy each activity is kept as, which is what Delete removes; a removal is busy until done.
  const keptIds = keptIdsOf(library, analysis.savedActivities)
  const removing = analysis.busy || analysis.libraryAction !== null
  // What the results are based on, at each page's foot. The sample has its own persona, so none.
  // The weight is named only once it is entered; settings then carries the athlete's own weight.
  // A ride held for its weight has a note of its own that links to Profile, so the line above it does not.
  const heldRide =
    route.page === 'ride' && !weightKnown && countSport(result.activities, 'ride') > 0
  const footnote = isSample ? null : (
    <ProfileFootnote
      massKg={weightKnown ? settings.massKg : null}
      units={units}
      birthYear={birthYear}
      sex={sex}
      unsetLink={!heldRide}
    />
  )
  // The unset line says what the year-of-birth-and-sex prompt says, so it goes while that prompt is on the
  // page: Balance's own prompt, or a run's age note under its best efforts. A held ride shows its weight
  // note in place of its records, so it has no age note and keeps the line. A weight entered keeps the line
  // too, which then says what the page is based on.
  const askingForAge = missingAge === 'year of birth and sex' && !weightKnown
  const balanceFootnote = askingForAge ? null : footnote
  const { pickPeriod, periods, caption, line, lineCounts, rows } = useResultPeriod({
    route,
    analysis,
    library,
    analysed,
    inPeriod,
  })
  // The notes about the data (copies hidden, runs at walking pace) sit with the period's line in the one Details under
  // the title, so nothing stands above it and the title does not move between Balance, Run and Ride.
  const notes = aboutNotesOf(analysis.state, route.page)
  const detailRows = [...rows, ...notes.map(noteRow)]
  const details =
    line === null && notes.length === 0 ? null : (
      <>
        {line}
        {notes.map((note) => (
          <p key={note.id}>{note.text}</p>
        ))}
      </>
    )
  return (
    <Shell route={route} periods={periods}>
      {pageOf()}
    </Shell>
  )

  function pageOf(): ReactNode {
    switch (route.page) {
      case 'run':
      case 'ride':
        return (
          <SportPage
            key={route.page}
            sport={route.page}
            result={result}
            previous={analysis.state.previous}
            previousThresholds={analysis.state.previousThresholds}
            previousLabel={previousPeriodLabel(period.days)}
            change={analysis.state.change}
            fitness={analysis.state.fitness}
            lookBack={analysis.state.lookBack}
            zoneTimes={
              analysis.state.timeInZones.widened?.[route.page]?.rows ??
              analysis.state.timeInZones.current[route.page]
            }
            previousZoneTimes={
              analysis.state.timeInZones.widened?.[route.page] === undefined
                ? (analysis.state.timeInZones.previous?.[route.page] ?? null)
                : null
            }
            zoneWindow={analysis.state.timeInZones.widened?.[route.page]?.window}
            units={units}
            massKg={athleteSettings.massKg}
            weighted={weightKnown}
            profile={profile}
            missingAge={missingAge}
            rangeDays={period.days}
            periodEndMs={period.endMs}
            heartRateJudgement={analysis.state.heartRateJudgement}
            onFile={countsOf(inPeriod, route.page).onFile}
            controls={caption}
            periodLine={details}
            periodCounts={lineCounts}
            emptyText={sportEmptyText(
              route.page,
              period,
              countSport(analysed, route.page),
              undefined,
              leftOut?.sport === route.page ? leftOut.count : 0,
            )}
            leftOut={leftOut?.sport === route.page ? leftOut : undefined}
            inLibrary={countSport(analysed, route.page)}
            library={analysed}
            onShowAll={() => pickPeriod('all')}
            onAddFiles={analysis.addFiles}
            footnote={
              askingForAge && route.page === 'run' && countSport(result.activities, 'run') > 0
                ? null
                : footnote
            }
          />
        )
      case 'history':
        return (
          <HistoryPage
            history={analysis.state.history}
            units={units}
            grading={{ profile, missingAge, weightKnown }}
            lookBack={analysis.state.lookBack}
          />
        )
      case 'activities':
        return (
          <ActivitiesPage
            activities={library}
            units={units}
            records={analysis.state.records}
            keptIds={keptIds}
            weightKnown={weightKnown}
            busy={removing}
            // Only this browser's own library is judged: a signed-in one reads older detail back from a saved original,
            // and the sample has detail for every activity.
            detailIds={judgedDetail(analysis.detail, { isSample, signedIn })?.ids ?? null}
            signedIn={signedIn}
            onDelete={analysis.deleteActivity}
            libraryNotice={analysis.libraryNotice}
            libraryError={analysis.libraryError}
            heldOut={analysis.state.heldOut}
          />
        )
      case 'activity': {
        // Every activity in the library opens, whatever the period: the period only narrows the analysis.
        const activity = library.find((candidate) => candidate.id === route.id) ?? null
        return (
          <ActivityPage
            key={route.id}
            activity={activity}
            library={library}
            result={result}
            zoneEstimates={analysis.state.zoneEstimates}
            units={units}
            massKg={athleteSettings.massKg}
            settings={athleteSettings}
            heartRateJudgement={analysis.state.heartRateJudgement}
            weightKnown={weightKnown}
            profile={profile}
            walkingChoice={
              activity === null
                ? undefined
                : {
                    counted: analysis.state.countedWalkingRuns.includes(workoutKeyOf(activity)),
                    onCount: () => countedRuns.count([workoutKeyOf(activity)]),
                    onStop: () => countedRuns.stop([workoutKeyOf(activity)]),
                  }
            }
            records={analysis.state.records}
            loadSplits={analysis.activitySplits}
            loadTrace={analysis.loadTrace}
            onAddFiles={analysis.addFiles}
            routeId={activity === null ? null : (keptIds.get(activity.id) ?? null)}
            loadRoute={analysis.loadRoute}
            period={period}
            busy={removing}
            signedIn={signedIn}
            onDelete={analysis.deleteActivity}
            libraryNotice={analysis.libraryNotice}
            libraryError={analysis.libraryError}
          />
        )
      }
      case 'method':
        return (
          <MethodPage
            result={result}
            heartRateJudgement={analysis.state.heartRateJudgement}
            profile={profile}
            period={period}
            weightKnown={weightKnown}
          />
        )
      default:
        return (
          <BalancePage
            analysis={analysis}
            result={result}
            settings={athleteSettings}
            weightKnown={weightKnown}
            units={units}
            profile={profile}
            missingAge={missingAge}
            controls={caption}
            periodRows={detailRows}
            leftOut={leftOut ?? undefined}
            onShowAll={() => pickPeriod('all')}
            footnote={balanceFootnote}
          />
        )
    }
  }
}
