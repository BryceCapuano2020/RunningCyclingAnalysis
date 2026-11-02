// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import { FITNESS_AS_OF_MS, RECOVERING, SLIPPING } from '../fitnessFixtures'
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

/** A run and a ride at three durations, graded for a man born in 1986, so the grade by duration is drawn. */
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

describe('the home page’s fitness', () => {
  it('sits under the balance: after its heading, the period control and the tiles, before the grades', () => {
    renderHome(undefined, undefined, true)
    const fitness = screen.getByRole('region', { name: 'Your fitness' })
    const title = screen.getByRole('heading', { level: 1 })
    const picker = screen.getByText('Period picker')
    const tiles = screen.getByRole('region', { name: 'Headline numbers' })
    const grades = screen.getByRole('region', { name: 'Grade by duration' })
    expect(follows(title, fitness)).toBe(true)
    expect(follows(picker, fitness)).toBe(true)
    expect(follows(tiles, fitness)).toBe(true)
    expect(follows(fitness, grades)).toBe(true)
    expect(fitness.parentElement?.firstElementChild).not.toBe(fitness)
  })

  it('says the run’s state with its figures, and the card is named by the state', () => {
    renderHome({ run: RECOVERING, ride: NO_FITNESS.ride })
    expect(screen.getByRole('article', { name: 'Recovering' })).toBeInTheDocument()
  })

  it('draws no fitness section for a library with no status, and the balance still opens the page', () => {
    renderHome(NO_FITNESS)
    expect(screen.queryByRole('region', { name: 'Your fitness' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('fitness-section')).not.toBeInTheDocument()
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.closest('.page-stack')?.firstElementChild).toContainElement(title)
  })

  it('says what would give a one-sport library a status when it has none, in one line and no card', () => {
    renderHome(NO_FITNESS, [makeActivity({ id: 'run-1', sport: 'run' })])
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(
      'Fitness needs heart rate. Add runs recorded with a strap or watch.',
    )
    expect(screen.queryByRole('region', { name: 'Your fitness' })).not.toBeInTheDocument()
  })

  it('names the power a ride needs, and leaves the line out once the sport has a status', () => {
    renderHome(NO_FITNESS, [makeActivity({ id: 'ride-1', sport: 'ride' })])
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(
      'Fitness needs power. Add rides recorded with a power meter.',
    )
    cleanup()
    renderHome({ run: SLIPPING, ride: NO_FITNESS.ride }, [
      makeActivity({ id: 'run-1', sport: 'run' }),
    ])
    expect(screen.queryByTestId('fitness-lack-line')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Your fitness' })).toBeInTheDocument()
  })

  it('says nothing about a lack for a library of both sports, which has its own balance to lead with', () => {
    renderHome(NO_FITNESS)
    expect(screen.queryByTestId('fitness-lack-line')).not.toBeInTheDocument()
  })

  it('asks a treadmill-only runner for outdoor runs, as fitness leaves treadmill runs out and heart rate is not what is missing', () => {
    renderHome(NO_FITNESS, [
      makeActivity({ id: 'run-1', sport: 'run', indoor: true }),
      makeActivity({ id: 'run-2', sport: 'run', indoor: true }),
    ])
    const line = screen.getByTestId('fitness-lack-line')
    expect(line).toHaveTextContent(
      'Fitness skips treadmill runs. Add runs recorded outdoors with a strap or watch.',
    )
    expect(line).not.toHaveTextContent(/needs heart rate/)
  })

  it('still asks for heart rate when some runs were outdoors', () => {
    renderHome(NO_FITNESS, [
      makeActivity({ id: 'run-1', sport: 'run', indoor: true }),
      makeActivity({ id: 'run-2', sport: 'run' }),
    ])
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(
      'Fitness needs heart rate. Add runs recorded with a strap or watch.',
    )
  })
})
