// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { makeActivity, makeResult } from '../components/fixtures'
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

function renderHome(
  fitness = { run: SLIPPING, ride: NO_FITNESS.ride },
  library = [] as ReturnType<typeof makeActivity>[],
) {
  return render(
    <BalancePage
      analysis={analysisStub({ state: { fitness, ...(library.length > 0 ? { library } : {}) } })}
      result={library.length > 0 ? makeResult({ activities: library }) : makeResult()}
      settings={SETTINGS}
      units="metric"
      profile={null}
      missingAge="year of birth and sex"
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
  it('leads the page: "Your fitness" comes before the balance’s own heading', () => {
    renderHome()
    const fitness = screen.getByRole('region', { name: 'Your fitness' })
    const title = screen.getByRole('heading', { level: 1 })
    expect(follows(fitness, title)).toBe(true)
    expect(fitness.parentElement?.firstElementChild).toBe(fitness)
  })

  it('says the run’s state with its figures, and the card is named by the state', () => {
    renderHome({ run: RECOVERING, ride: NO_FITNESS.ride })
    expect(screen.getByRole('article', { name: 'Recovering' })).toBeInTheDocument()
  })

  it('draws nothing above the balance for a library with no status, so the balance leads as before', () => {
    renderHome(NO_FITNESS)
    expect(screen.queryByRole('region', { name: 'Your fitness' })).not.toBeInTheDocument()
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.closest('.page-stack')?.firstElementChild).not.toHaveAttribute(
      'data-testid',
      'fitness-section',
    )
  })

  it('says what would give a one-sport library a status when it has none, in one line and no card', () => {
    renderHome(NO_FITNESS, [makeActivity({ id: 'run-1', sport: 'run' })])
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(
      'Fitness at the same effort needs heart rate: add runs recorded with a strap or watch.',
    )
    expect(screen.queryByRole('region', { name: 'Your fitness' })).not.toBeInTheDocument()
  })

  it('names the power a ride needs, and leaves the line out once the sport has a status', () => {
    renderHome(NO_FITNESS, [makeActivity({ id: 'ride-1', sport: 'ride' })])
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(/needs power/)
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
    expect(line).toHaveTextContent(/needs outdoor runs/)
    expect(line).not.toHaveTextContent(/needs heart rate/)
  })

  it('still asks for heart rate when some runs were outdoors', () => {
    renderHome(NO_FITNESS, [
      makeActivity({ id: 'run-1', sport: 'run', indoor: true }),
      makeActivity({ id: 'run-2', sport: 'run' }),
    ])
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(/needs heart rate/)
  })
})
