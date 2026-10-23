import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { RangePicker } from '../components'
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
}

/** The page the route names, once there is a result to show. */
export function ResultPage({ route, analysis, result, settings, units }: ResultPageProps) {
  const { rangeDays, totalActivities } = analysis.state
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
          sport={route.page}
          result={result}
          units={units}
          massKg={settings.massKg}
          controls={period}
        />
      )
    case 'activities':
      return <ActivitiesPage activities={result.activities} units={units} />
    case 'activity':
      return (
        <ActivityPage
          activity={result.activities.find((activity) => activity.id === route.id) ?? null}
          result={result}
          units={units}
          massKg={settings.massKg}
        />
      )
    case 'method':
      return <MethodPage result={result} />
    default:
      return (
        <BalancePage
          analysis={analysis}
          result={result}
          settings={settings}
          units={units}
          controls={period}
        />
      )
  }
}
