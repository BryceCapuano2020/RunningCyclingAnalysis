// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { curvePoint } from '../charts/test/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/test/fixtures'
import { FITNESS_AS_OF_MS, SLIPPING } from '../test/fitnessFixtures'
import { BalancePage } from './BalancePage'

/** The status is as of the fixtures' day; today is read for how new it is, so the tests set it. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FITNESS_AS_OF_MS)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

/** A run and a ride at three durations, graded for a man born in 1986, so the levels are shown. */
const GRADED = makeResult({
  runCurve: [600, 1200, 3600].map((d) => curvePoint(d, FIVE_K_IN_20_MIN_WKG, 'run-1')),
  rideCurve: [600, 1200, 3600].map((d) => curvePoint(d, 400, 'ride-1')),
  equivalents: [600, 1200, 3600].map((d) => makeEquivalence({ durationS: d })),
})

function renderHome(
  fitness = { run: SLIPPING, ride: NO_FITNESS.ride },
  library = [] as ReturnType<typeof makeActivity>[],
  graded = false,
) {
  return render(
    <BalancePage
      analysis={analysisStub({ state: { fitness, ...(library.length > 0 ? { library } : {}) } })}
      result={
        graded ? GRADED : library.length > 0 ? makeResult({ activities: library }) : makeResult()
      }
      settings={SETTINGS}
      units="metric"
      profile={graded ? MAN_BORN_1986 : null}
      missingAge={graded ? null : 'year of birth and sex'}
      controls={<span>Period picker</span>}
      weightKnown
      onShowAll={vi.fn()}
    />,
  )
}

/** Whether b comes after a in the document. */
const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('the home page and fitness', () => {
  it('draws no fitness section: it is on the Run and Ride pages, and the levels follow the tiles', () => {
    renderHome(undefined, undefined, true)
    expect(screen.queryByRole('region', { name: 'Your fitness' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('fitness-section')).not.toBeInTheDocument()
    const tiles = screen.getByRole('region', { name: 'Headline numbers' })
    const levels = screen.getByRole('region', { name: 'Levels' })
    expect(follows(tiles, levels)).toBe(true)
  })

  it('draws none for a one-sport library either, and no line about what fitness needs', () => {
    renderHome(NO_FITNESS, [makeActivity({ id: 'run-1', sport: 'run' })])
    expect(screen.queryByTestId('fitness-lack-line')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fitness-section')).not.toBeInTheDocument()
  })
})
