import { useEffect, type ReactNode } from 'react'
import type { Sex } from '@rca/core/grade'
import { outranks } from '@rca/core/session'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { PeriodChoice } from '@rca/core/period'
import { trendWindowDays } from '@rca/core/digest/trendPoints'
import type { AthleteSettings, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { RangePicker } from '../components'
import { FALLBACK_NOTE, periodDates, previousPeriodLabel } from '../components/rangeOptions'
import { usePeriodChoice } from '../periodPreference'
import { ageProfileOf, missingAgeOf } from '../grades'
import { countSport } from '../records'
import { latestActivityText, sportEmptyText } from '../periodCopy'
import type { SavedActivity } from '../../worker/protocol'
import type { Route } from '../route'
import type { AnalysisController } from '../useAnalysis'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
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
  const setRange = analysis.setRange
  // Each effort is graded at its own date, so the profile carries the year of birth, not an age.
  // The sample athlete has its own age, sex and masses, whatever the visitor has entered.
  const profile = isSample ? SAMPLE_PROFILE : ageProfileOf(birthYear, sex)
  // The prompt for a missing field names only that field; the sample has all of them.
  const missingAge = isSample ? null : missingAgeOf(birthYear, sex)
  const athlete = isSample ? SAMPLE_SETTINGS : settings
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
  // Balance's prompt for a missing year of birth and sex says the same as the unset line, so the line goes
  // while the prompt is there. A weight entered keeps the line, which then says what the page is based on.
  const balanceFootnote = missingAge === 'year of birth and sex' && !weightKnown ? null : footnote
  const [storedChoice, storeChoice] = usePeriodChoice()
  // Library and sample loads are told the period picked on this device. Files analysed while the
  // account loads are not, so for them it is sent once there is a result to show it on.
  useEffect(() => {
    if (period.choice !== storedChoice) setRange(storedChoice)
  }, [period.choice, storedChoice, setRange])

  const pickPeriod = (choice: PeriodChoice, answered?: (reply: unknown) => void) => {
    storeChoice(choice)
    setRange(choice, answered)
  }
  // The newest activity in the library dates the answer: a library last written to long ago says so.
  const newestMs = library.reduce<number | null>(
    (newest, activity) =>
      newest === null || activity.startMs > newest ? activity.startMs : newest,
    null,
  )
  const latest = latestActivityText(newestMs)
  // The fallback names both sports, so with one sport in the library there is nothing for it to say.
  const bothSports = countSport(library, 'run') > 0 && countSport(library, 'ride') > 0
  // The note under the dates says why the default is all time, then how old the newest activity is.
  const control = (
    shown: number,
    total: number,
    noun?: Sport,
    dated: string | null = null,
  ): ReactNode => (
    <RangePicker
      choice={period.choice}
      dates={periodDates(period)}
      note={[period.fellBack && bothSports ? FALLBACK_NOTE : null, dated].filter(Boolean).join(' ')}
      shown={shown}
      total={total}
      noun={noun}
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
          units={units}
          massKg={athlete.massKg}
          weighted={weightKnown}
          profile={profile}
          missingAge={missingAge}
          rangeDays={period.days}
          controls={control(
            countSport(result.activities, route.page),
            countSport(library, route.page),
            route.page,
          )}
          emptyText={sportEmptyText(route.page, period, countSport(library, route.page))}
          inLibrary={countSport(library, route.page)}
          library={library}
          onShowAll={() => pickPeriod('all')}
          onAddFiles={analysis.addFiles}
          footnote={footnote}
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
          activity={activity}
          library={library}
          result={result}
          units={units}
          massKg={athlete.massKg}
          weightKnown={weightKnown}
          profile={profile}
          records={analysis.state.records}
          loadSplits={analysis.activitySplits}
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
          settings={athlete}
          weightKnown={weightKnown}
          units={units}
          profile={profile}
          missingAge={missingAge}
          controls={control(result.activities.length, totalActivities, undefined, latest)}
          onShowAll={() => pickPeriod('all')}
          footnote={balanceFootnote}
        />
      )
  }
}
