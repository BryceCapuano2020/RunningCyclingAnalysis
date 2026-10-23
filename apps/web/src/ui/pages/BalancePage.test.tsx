// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import type { TrendPoint } from '@rca/core/digest'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import { makeEquivalence, makeResult } from '../components/fixtures'
import { BalancePage } from './BalancePage'

afterEach(() => {
  cleanup()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

function renderPage(result: AnalysisResult = makeResult(), overrides: AnalysisStubOverrides = {}) {
  return render(
    <BalancePage
      analysis={analysisStub(overrides)}
      result={result}
      settings={SETTINGS}
      units="metric"
      controls={<span>Period picker</span>}
    />,
  )
}

/** Two weeks with a running value: the fitness trend is shown only from two. */
function trendWithWeeks(weeks: number): TrendPoint[] {
  return Array.from({ length: weeks }, (_, index) => ({
    endMs: new Date(2026, 0, 4 + index * 7, 23, 59).getTime(),
    runWkg: 3.4,
    rideWkg: null,
    runCount: 1,
    rideCount: 0,
  }))
}

describe('BalancePage', () => {
  it('opens on the answer, with the period control beside the eyebrow', () => {
    renderPage()

    expect(screen.getByText('Your balance')).toBeInTheDocument()
    expect(screen.getByText('Period picker')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your balance leans toward running',
      }),
    ).toHaveAttribute('id', 'page-heading')
  })

  it('marks the sample athlete only when the sample is on screen', () => {
    const { unmount } = renderPage(makeResult(), { state: { isSample: true } })
    expect(screen.getByText('Sample athlete')).toBeInTheDocument()
    unmount()

    renderPage()
    expect(screen.queryByText('Sample athlete')).not.toBeInTheDocument()
  })

  it('shows a card for each sport, named by the sport', () => {
    renderPage()
    expect(screen.getByRole('region', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ride' })).toBeInTheDocument()
  })

  it('shows the evidence for the duration the answer is about', () => {
    renderPage(
      makeResult({ effort: [{ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 }] }),
    )
    expect(screen.getByRole('region', { name: 'Your ride number may be low' })).toBeInTheDocument()
  })

  it('shows the bike on foot in the cross-sport card, which opens to every duration', () => {
    renderPage(makeResult({ equivalents: [makeEquivalence()] }))

    const card = screen.getByRole('region', { name: 'On foot, your bike is worth 4:10 /km' })
    expect(within(card).getByText('See every duration')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Your bike on foot, at every duration' }),
    ).not.toBeInTheDocument()
  })

  it('shows the fitness trend only once two weeks have a value', () => {
    const { unmount } = renderPage(makeResult(), { state: { trend: trendWithWeeks(1) } })
    expect(screen.queryByRole('heading', { name: 'Fitness over time' })).not.toBeInTheDocument()
    unmount()

    renderPage(makeResult(), { state: { trend: trendWithWeeks(2) } })
    expect(screen.getByRole('heading', { name: 'Fitness over time' })).toBeInTheDocument()
  })

  it('links to how sure the answer is once, from the evidence card', () => {
    renderPage()
    const links = screen.getAllByRole('link', { name: 'How sure is this?' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '#/method')
  })

  it('offers the image download while the analysis is idle', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Download image' })).toBeEnabled()
  })

  it('holds the image download until the analysis finishes', () => {
    renderPage(makeResult(), { busy: true })

    expect(screen.getByRole('button', { name: 'Download image' })).toBeDisabled()
    expect(screen.getByText('Available when the analysis finishes.')).toBeInTheDocument()
  })

  it('offers no image when there is no comparison to draw', () => {
    renderPage(makeResult({ comparison: { prior: [], calibrated: null } }))
    expect(screen.queryByRole('button', { name: 'Download image' })).not.toBeInTheDocument()
  })
})
