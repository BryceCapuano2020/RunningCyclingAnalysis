import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Sex } from '@rca/core/grade'
import type { AnalysisResult } from '@rca/core/pipeline'
import { periodDays, sameChoice } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { RangePicker } from '../components'
import { periodDates, previousPeriodLabel } from '../components/rangeOptions'
import { judgedDetail } from '../analysis/detailCoverage'
import { leftOutRuns, withoutWalking, workoutKeyOf } from '../analysis/walkingPaceCopy'
import { plural } from '../components/plural'
import { usePeriodChoice } from '../periodPreference'
import { sameAsShorterText } from '../periodSame'
import { windowLine } from '../windowLine'
import { ageProfileOf, missingAgeOf } from '../grades'
import { countSport } from '../records'
import { latestActivityText, sportEmptyText } from '../periodCopy'
import { hrefFor } from '../route'
import type { Route } from '../route'
import type { AnalysisController } from '../useAnalysis'
import type { CountedRunsController } from '../useCountedRuns'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS, sampleProfileAt } from '../sampleAthlete'
import { ActivitiesPage } from './ActivitiesPage'
import { ActivityPage } from './ActivityPage'
import { BalancePage } from './BalancePage'
import { HistoryPage } from './HistoryPage'
import { ProfileFootnote } from '../components/ProfileFootnote'
import { MethodPage } from './MethodPage'
import { askHeadingFocus, useHeadingFocusWhen } from './useHeadingFocus'
import { SportPage } from './SportPage'
import { keptIdsOf } from './keptIds'

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

/**
 * The notes under the period's dates as one line: Balance's sit in the dates' own line, so they are joined with a
 * dot and end without a full stop; a sport page's follow each other as sentences.
 */
function noteOf(notes: (string | null)[], inline: boolean): string {
  const said = notes.filter((note): note is string => note !== null && note !== '')
  return inline ? said.map((note) => note.replace(/\.$/, '')).join(' · ') : said.join(' ')
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
  const { period, library, totalActivities, isSample } = analysis.state
  // What the analysis rests on: the library less the runs at walking pace, which only the lists and pages show.
  const analysed = useMemo(() => withoutWalking(library), [library])
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
  const setRange = analysis.setRange
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
  const [storedChoice, storeChoice] = usePeriodChoice()
  // Library and sample loads are told the period picked on this device. Files analysed while the
  // account loads are not, so for them it is sent once there is a result to show it on.
  // The choice already sent and not yet answered, so a pick is sent once: storing it changes
  // `storedChoice` before the analysis's period catches up, which the effect would send again.
  const sent = useRef<{ choice: PeriodChoice; shownWas: PeriodChoice } | null>(null)
  useEffect(() => {
    // The period on screen moved, so whatever was sent has been answered, or replaced by a load.
    if (sent.current !== null && !sameChoice(sent.current.shownWas, period.choice))
      sent.current = null
    if (sameChoice(period.choice, storedChoice)) return
    if (sent.current !== null && sameChoice(sent.current.choice, storedChoice)) return
    sent.current = { choice: storedChoice, shownWas: period.choice }
    setRange(storedChoice)
  }, [period.choice, storedChoice, setRange])

  const pickPeriod = (choice: PeriodChoice, answered?: (reply: unknown) => void) => {
    storeChoice(choice)
    sent.current = { choice, shownWas: period.choice }
    setRange(choice, answered)
  }
  // The newest activity in the library dates the answer: a library last written to long ago says so.
  const newestMs = analysed.reduce<number | null>(
    (newest, activity) =>
      newest === null || activity.startMs > newest ? activity.startMs : newest,
    null,
  )
  const latest = latestActivityText(newestMs)
  // Where the default is not the 12 weeks it starts from, one line says which window the page is on and why the shorter was passed over.
  const windowNote = windowLine(analysis.state.answerWindow)
  // The note under the dates says why the default is the window it is, then how old the newest activity is.
  // Balance sets its period control compact under the levels: it says when a longer period repeats a shorter one,
  // links its count to the activities, and says how many runs at walking pace the count leaves out.
  const walking = analysis.state.walkingPaceRuns
  const control = (
    shown: number,
    total: number,
    noun?: Sport,
    dated: string | null = null,
    balance = false,
  ): ReactNode => (
    <RangePicker
      choice={period.choice}
      resolved={analysis.state.answerWindow.choice}
      custom
      range={periodDays(period)}
      dates={periodDates(period)}
      note={noteOf(
        [windowNote, balance ? sameAsShorterText(analysed, period) : null, dated],
        balance,
      )}
      shown={shown}
      total={total}
      noun={noun}
      compact={balance}
      countHref={balance ? hrefFor({ page: 'activities' }) : undefined}
      leftOut={
        balance && walking > 0 ? `(${plural(walking, 'walking-pace run')} left out)` : undefined
      }
      busy={analysis.busy}
      onChange={pickPeriod}
    />
  )
  switch (route.page) {
    case 'run':
    case 'ride':
      return (
        <SportPage
          key={route.page}
          sport={route.page}
          result={result}
          previous={analysis.state.previous}
          previousLabel={previousPeriodLabel(period.days)}
          change={analysis.state.change}
          trends={analysis.state.effortTrends}
          dotsWithheld={analysis.state.dotsWithheld}
          sameHeartRate={analysis.state.sameHeartRate[route.page]}
          fitness={analysis.state.fitness}
          lookBack={analysis.state.lookBack}
          lateEvidence={analysis.state.lateEvidence[route.page]}
          libraryBests={analysis.state.libraryBests?.[route.page] ?? null}
          zoneTimes={analysis.state.timeInZones.current[route.page]}
          previousZoneTimes={analysis.state.timeInZones.previous?.[route.page] ?? null}
          units={units}
          massKg={athleteSettings.massKg}
          weighted={weightKnown}
          profile={profile}
          missingAge={missingAge}
          rangeDays={period.days}
          controls={control(
            countSport(result.activities, route.page),
            countSport(analysed, route.page),
            route.page,
          )}
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
      return <HistoryPage history={analysis.state.history} units={units} />
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
          analysisPeriod={period}
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
          units={units}
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
          controls={control(result.activities.length, totalActivities, undefined, latest, true)}
          leftOut={leftOut ?? undefined}
          onShowAll={() => pickPeriod('all')}
          footnote={balanceFootnote}
        />
      )
  }
}
