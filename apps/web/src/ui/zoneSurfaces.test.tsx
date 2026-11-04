// @vitest-environment jsdom
import '../test/warmSample'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { THRESHOLD_WINDOW_WEEKS } from '@rca/core/display'
import { DAY_MS } from '@rca/core/constants'
import { weekEndFor, weekEndInstant } from '@rca/core/calendar'
import { AnalysisSession } from '@rca/core/session'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDayMonth } from './format/date'
import { SAMPLE_SETTINGS } from './sampleAthlete'
import { ThresholdTile } from './pages/ThresholdTile'
import { zoneTable } from './zoneRows'

afterEach(cleanup)

/*
 * The zones are cut per week from the settled timeline of thresholds, and the tile states the period's threshold. When the period is
 * the 26 weeks to the newest activity they are one number: the tile and the zones' source line print it the same
 * (docs/ENGINEERING.md, "One figure, one function").
 */

const SETTINGS = SAMPLE_SETTINGS
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The sample athlete's state with the period set to the 26 weeks that end with the week of the newest activity. */
function stateOver26Weeks() {
  const session = new AnalysisSession()
  const newest = session.loadSample(SETTINGS).library[0]!.startMs
  const end = weekEndFor({ startMs: newest })
  session.choosePeriod({ from: day(end - THRESHOLD_WINDOW_WEEKS * 7 * DAY_MS + 1), to: day(end) })
  return { state: session.loadSample(SETTINGS), session, newest, end }
}

/** What a sport's threshold tile prints as its figure, and the unit beside it. */
function tileFigure(sport: Sport, units: UnitSystem): string {
  const { state } = stateOver26Weeks()
  const { container } = render(
    <ThresholdTile
      sport={sport}
      result={state.result!}
      units={units}
      massKg={SETTINGS.massKg}
      grade={null}
      weighted
    />,
  )
  const number = container.querySelector('.stat-tile__number')?.textContent
  const unit = container.querySelector('.stat-tile__unit')?.textContent
  cleanup()
  return `${number} ${unit}`
}

describe.each(['metric', 'imperial'] as const)('the zones and the tile, in %s units', (units) => {
  it.each(['run', 'ride'] as const)(
    'print the same %s threshold when the period is the 26 weeks to the newest activity',
    (sport) => {
      const { session, newest, end } = stateOver26Weeks()
      const measure = sport === 'run' ? 'pace' : 'power'
      const set = session
        .zonesAt(newest, SETTINGS)
        .find((each) => each.measure === measure && each.sport === sport)!
      const printed = tileFigure(sport, units)
      const line = zoneTable(set, units).detail
      expect(printed).toMatch(/^(\d+ W|\d+:\d{2} \/(km|mi))$/)
      // The window is one of the 26 weeks the period spans, the newest at latest: the zones lag a window that has not yet settled.
      expect(set.windowEndMs).not.toBeNull()
      expect(set.windowEndMs!).toBeLessThanOrEqual(weekEndInstant(end))
      expect(line).toBe(
        `Zones cut from ${printed}, your threshold over the ${THRESHOLD_WINDOW_WEEKS} weeks to ${formatDayMonth(set.windowEndMs!)}`,
      )
    },
  )
})
