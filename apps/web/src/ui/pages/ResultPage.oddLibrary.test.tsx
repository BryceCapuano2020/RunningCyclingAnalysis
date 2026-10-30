// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { digestActivity } from '@rca/core/digest'
import { AnalysisSession } from '@rca/core/session'
import { oddLibraries } from '@rca/core/synthetic/odd'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { Route } from '../route'
import { analysisStub, countedRunsStub } from '../../test/analysisStub'
import { ResultPage } from './ResultPage'

/**
 * The pages for the odd libraries a real export holds: a file with no samples, a recording that moved
 * nowhere, a 48-hour file, copies that start together, one activity in the period, a library that never
 * left a trainer. None may throw, and no page may print a figure that is not a number.
 */

afterEach(() => {
  cleanup()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const NOT_A_FIGURE = /NaN|Infinity|undefined|\[object/

function renderPage(
  route: Route,
  state: ReturnType<AnalysisSession['loadDigests']>,
  units: UnitSystem,
) {
  return render(
    <ResultPage
      countedRuns={countedRunsStub()}
      signedIn={false}
      route={route}
      analysis={analysisStub({ state })}
      result={state.result!}
      settings={SETTINGS}
      weightKnown
      units={units}
      birthYear={1990}
      sex="male"
    />,
  )
}

describe.each(Object.entries(oddLibraries()))(
  'the pages for a library of %s',
  (_name, activities) => {
    const state = new AnalysisSession().loadDigests(
      activities.map((activity) => digestActivity(activity)),
      SETTINGS,
    )
    const routes: Route[] = [
      { page: 'balance' },
      { page: 'run' },
      { page: 'ride' },
      { page: 'activities' },
      ...state.library.map((activity): Route => ({ page: 'activity', id: activity.id })),
    ]

    it.each(routes.map((route) => [JSON.stringify(route), route] as const))(
      'show no figure that is not a number on %s',
      (_label, route) => {
        for (const units of ['metric', 'imperial'] as const) {
          const { container, unmount } = renderPage(route, state, units)
          // A page that drew nothing would pass the check below, so it must have drawn something.
          expect(container.textContent!.length).toBeGreaterThan(40)
          expect(container.textContent).not.toMatch(NOT_A_FIGURE)
          unmount()
        }
      },
    )
  },
)
