import type { Sex } from '@rca/core/grade'
import type { AnalysisResult } from '@rca/core/pipeline'
import { trendWindowDays } from '@rca/core/digest/trendPoints'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { RangePicker } from '../components'
import { previousPeriodLabel } from '../components/rangeOptions'
import type { AgeProfile } from '../grades'
import type { Route } from '../route'
import type { AnalysisController } from '../useAnalysis'
import { ActivitiesPage } from './ActivitiesPage'
import { ActivityPage } from './ActivityPage'
import { BalancePage } from './BalancePage'
import { MethodPage } from './MethodPage'
import { SportPage } from './SportPage'

export interface ResultPageProps {
  route: Route
  analysis: AnalysisController
  result: AnalysisResult
  settings: AthleteSettings
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
  units,
  birthYear,
  sex,
}: ResultPageProps) {
  const { rangeDays, totalActivities } = analysis.state
  // Each effort is graded at its own date, so the profile carries the year of birth, not an age.
  const profile: AgeProfile | null = birthYear !== null && sex !== null ? { birthYear, sex } : null
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
          profile={profile}
          controls={period}
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
    case 'activity':
      return (
        <ActivityPage
          activity={result.activities.find((activity) => activity.id === route.id) ?? null}
          result={result}
          units={units}
          massKg={settings.massKg}
          records={analysis.state.records}
          loadSplits={analysis.activitySplits}
        />
      )
    case 'method':
      return <MethodPage result={result} units={units} profile={profile} />
    default:
      return (
        <BalancePage
          analysis={analysis}
          result={result}
          settings={settings}
          units={units}
          profile={profile}
          controls={period}
        />
      )
  }
}
