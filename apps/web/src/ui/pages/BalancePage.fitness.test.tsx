// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import { makeResult } from '../components/fixtures'
import { RECOVERING, SLIPPING } from '../fitnessFixtures'
import { BalancePage } from './BalancePage'

afterEach(cleanup)

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

function renderHome(fitness = { run: SLIPPING, ride: NO_FITNESS.ride }) {
  return render(
    <BalancePage
      analysis={analysisStub({ state: { fitness } })}
      result={makeResult()}
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
})
