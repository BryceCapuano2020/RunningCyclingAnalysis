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
import { ageProfileOf } from '../grades'
import { countSport } from '../records'
import { sportEmptyText } from '../periodCopy'
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
 * The library id of the saved copy the analysis keeps for this activity: among the saved copies that
 * start with it, the one that outranks the others by the analysis's own rule. Null when none is saved.
 */
function savedIdOf(activity: ActivitySummary | null, saved: SavedActivity[]): string | null {
  if (activity === null) return null
  let kept: SavedActivity | undefined
  for (const s of saved) {
    if (s.sport !== activity.sport || s.startMs !== activity.startMs) continue
    if (kept === undefined || outranks(s.copy, kept.copy)) kept = s
  }
  return kept?.id ?? null
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
}: ResultPageProps) {
  const { period, library, totalActivities, isSample } = analysis.state
  const setRange = analysis.setRange
  // Each effort is graded at its own date, so the profile carries the year of birth, not an age.
  // The sample athlete has its own age, sex and masses, whatever the visitor has entered.
  const profile = isSample ? SAMPLE_PROFILE : ageProfileOf(birthYear, sex)
  const athlete = isSample ? SAMPLE_SETTINGS : settings
  // What the results are based on, at each page's foot. The sample has its own persona, so none.
  // The weight is named only once it is entered; settings then carries the athlete's own weight.
  const footnote = isSample ? null : (
    <ProfileFootnote
      massKg={weightKnown ? settings.massKg : null}
      units={units}
      birthYear={birthYear}
      sex={sex}
    />
  )
  const [storedChoice, storeChoice] = usePeriodChoice()
  // The worker starts on the default period, so the period picked on this device is sent once
  // there is a result to show it on.
  useEffect(() => {
    if (period.choice !== storedChoice) setRange(storedChoice)
  }, [period.choice, storedChoice, setRange])

  const pickPeriod = (choice: PeriodChoice, answered?: (reply: unknown) => void) => {
    storeChoice(choice)
    setRange(choice, answered)
  }
  const control = (shown: number, total: number, noun?: Sport): ReactNode => (
    <RangePicker
      choice={period.choice}
      dates={periodDates(period)}
      note={period.fellBack ? FALLBACK_NOTE : undefined}
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
          rangeDays={period.days}
          controls={control(
            countSport(result.activities, route.page),
            countSport(library, route.page),
            route.page,
          )}
          emptyText={sportEmptyText(route.page, period, countSport(library, route.page))}
          onAddFiles={analysis.addFiles}
          footnote={footnote}
        />
      )
    case 'activities':
      return <ActivitiesPage activities={library} units={units} records={analysis.state.records} />
    case 'activity': {
      // Every activity in the library opens, whatever the period: the period only narrows the analysis.
      const activity = library.find((candidate) => candidate.id === route.id) ?? null
      return (
        <ActivityPage
          activity={activity}
          result={result}
          units={units}
          massKg={athlete.massKg}
          records={analysis.state.records}
          loadSplits={analysis.activitySplits}
          routeId={savedIdOf(activity, analysis.savedActivities)}
          loadRoute={analysis.loadRoute}
          period={period}
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
          controls={control(result.activities.length, totalActivities)}
          onShowAll={() => pickPeriod('all')}
          footnote={footnote}
        />
      )
  }
}
