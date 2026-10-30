import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Sex } from '@rca/core/grade'
import { outranks } from '@rca/core/session'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { periodDays, sameChoice } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'
import { trendWindowDays } from '@rca/core/digest/trendPoints'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { RangePicker } from '../components'
import { FALLBACK_NOTE, periodDates, previousPeriodLabel } from '../components/rangeOptions'
import { withoutWalking } from '../analysis/walkingPaceCopy'
import { plural } from '../components/plural'
import { usePeriodChoice } from '../periodPreference'
import { sameAsShorterText } from '../periodSame'
import { ageProfileOf, missingAgeOf } from '../grades'
import { countSport } from '../records'
import { latestActivityText, sportEmptyText } from '../periodCopy'
import type { SavedActivity } from '../../worker/protocol'
import { hrefFor } from '../route'
import type { Route } from '../route'
import type { AnalysisController } from '../useAnalysis'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS, sampleProfileAt } from '../sampleAthlete'
import { ActivitiesPage } from './ActivitiesPage'
import { ActivityPage } from './ActivityPage'
import { BalancePage } from './BalancePage'
import { ProfileFootnote } from '../components/ProfileFootnote'
import { MethodPage } from './MethodPage'
import { SportPage } from './SportPage'

/**
 * The library id of the saved copy the analysis keeps for each activity, by activity id. Among the saved
 * copies that start with an activity, the one that outranks the others by the analysis's own rule. An
 * activity with no saved copy, as with the sample, is absent.
 */
function keptIdsOf(library: ActivitySummary[], saved: SavedActivity[]): Map<string, string> {
  const kept = new Map<string, SavedActivity>()
  for (const s of saved) {
    const key = `${s.sport}|${s.startMs}`
    const current = kept.get(key)
    if (current === undefined || outranks(s.copy, current.copy)) kept.set(key, s)
  }
  const ids = new Map<string, string>()
  for (const activity of library) {
    const copy = kept.get(`${activity.sport}|${activity.startMs}`)
    if (copy !== undefined) ids.set(activity.id, copy.id)
  }
  return ids
}

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
}: ResultPageProps) {
  const { period, library, totalActivities, isSample } = analysis.state
  // What the analysis rests on: the library less the runs at walking pace, which only the lists and pages show.
  const analysed = useMemo(() => withoutWalking(library), [library])
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
  // The fallback names both sports, so with one sport in the library there is nothing for it to say.
  const bothSports = countSport(analysed, 'run') > 0 && countSport(analysed, 'ride') > 0
  // The note under the dates says why the default is all time, then how old the newest activity is.
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
      custom
      range={periodDays(period)}
      dates={periodDates(period)}
      note={noteOf(
        [
          period.fellBack && bothSports ? FALLBACK_NOTE : null,
          balance ? sameAsShorterText(analysed, period) : null,
          dated,
        ],
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
          trends={analysis.state.effortTrends}
          windowDays={trendWindowDays(period.days)}
          sameHeartRate={analysis.state.sameHeartRate[route.page]}
          fitness={analysis.state.fitness}
          lateEvidence={analysis.state.lateEvidence[route.page]}
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
          emptyText={sportEmptyText(route.page, period, countSport(analysed, route.page))}
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
    case 'activities':
      return (
        <ActivitiesPage
          activities={library}
          units={units}
          records={analysis.state.records}
          keptIds={keptIds}
          weightKnown={weightKnown}
          busy={removing}
          // A signed-in library can read older detail back from a saved original, so only this browser's own is judged.
          detailIds={signedIn ? null : (analysis.detail?.ids ?? null)}
          signedIn={signedIn}
          onDelete={analysis.deleteActivity}
          libraryNotice={analysis.libraryNotice}
          libraryError={analysis.libraryError}
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
          onShowAll={() => pickPeriod('all')}
          footnote={balanceFootnote}
        />
      )
  }
}
