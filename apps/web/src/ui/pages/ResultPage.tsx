import type { Sex } from '@rca/core/grade'
import { outranks } from '@rca/core/session'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { trendWindowDays } from '@rca/core/digest/trendPoints'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { RangePicker } from '../components'
import { previousPeriodLabel } from '../components/rangeOptions'
import { ageProfileOf } from '../grades'
import type { SavedActivity } from '../../worker/protocol'
import type { Route } from '../route'
import type { AnalysisController } from '../useAnalysis'
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
  const { isSample, rangeDays, totalActivities } = analysis.state
  // Each effort is graded at its own date, so the profile carries the year of birth, not an age.
  const profile = ageProfileOf(birthYear, sex)
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
  const period = (
    <RangePicker
      rangeDays={rangeDays}
      onChange={analysis.setRange}
      shown={result.activities.length}
      total={totalActivities}
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
          previousLabel={previousPeriodLabel(rangeDays)}
          trends={analysis.state.effortTrends}
          windowDays={trendWindowDays(rangeDays)}
          units={units}
          massKg={settings.massKg}
          weighted={weightKnown}
          profile={profile}
          controls={period}
          footnote={footnote}
        />
      )
    case 'activities':
      return (
        <ActivitiesPage
          activities={result.activities}
          units={units}
          records={analysis.state.records}
        />
      )
    case 'activity': {
      const activity = result.activities.find((candidate) => candidate.id === route.id) ?? null
      return (
        <ActivityPage
          activity={activity}
          result={result}
          units={units}
          massKg={settings.massKg}
          records={analysis.state.records}
          loadSplits={analysis.activitySplits}
          routeId={savedIdOf(activity, analysis.savedActivities)}
          loadRoute={analysis.loadRoute}
        />
      )
    }
    case 'method':
      return (
        <MethodPage
          result={result}
          units={units}
          profile={profile}
          rangeDays={rangeDays}
          weightKnown={weightKnown}
        />
      )
    default:
      return (
        <BalancePage
          analysis={analysis}
          result={result}
          settings={settings}
          weightKnown={weightKnown}
          units={units}
          profile={profile}
          controls={period}
          footnote={footnote}
        />
      )
  }
}
