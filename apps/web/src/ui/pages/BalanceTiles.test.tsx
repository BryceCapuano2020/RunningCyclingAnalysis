// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import type { Period } from '@rca/core/period'
import { makeActivity, makeResult, makeRunThreshold } from '../components/fixtures'
import { headlineGrades } from '../grades'
import { threshold } from '../records'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { thresholdRange } from '../thresholdRange'
import { BalanceTiles } from './BalanceTiles'

afterEach(cleanup)

const PERIOD: Period = { choice: 'all', startMs: null, endMs: null, days: null, fellBack: false }

function sample() {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  const { result } = state
  if (result === null) throw new Error('The sample has no result')
  const headline = headlineGrades(result, SAMPLE_PROFILE)
  return { state, result, grades: { run: headline.run, ride: headline.ride } }
}

function renderTiles(over: Partial<Parameters<typeof BalanceTiles>[0]> = {}) {
  const { state, result, grades } = sample()
  return render(
    <BalanceTiles
      result={result}
      library={state.library}
      units="metric"
      massKg={SAMPLE_SETTINGS.massKg}
      grades={grades}
      weighted
      period={PERIOD}
      onAddFiles={vi.fn()}
      {...over}
    />,
  )
}

describe('BalanceTiles', () => {
  it('shows three tiles with both sports, each threshold and the ride as a run, and none for the lean', () => {
    const { container } = renderTiles()
    expect(container.querySelector('.balance-tiles')).toHaveAttribute('data-tiles', '3')
    expect(screen.getAllByRole('article').map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Run threshold',
      'Ride threshold',
      'Your ride as a run',
    ])
  })

  it('writes each threshold exactly as the sport cards do: no chip, the range in words one tap down, for a run as for a ride', () => {
    const { result } = sample()
    renderTiles()
    for (const [name, sport] of [
      ['Run threshold', 'run'],
      ['Ride threshold', 'ride'],
    ] as const) {
      const tile = screen.getByRole('article', { name })
      const figure = threshold(result, sport, SAMPLE_SETTINGS.massKg, 'metric')
      expect(tile.querySelector('.stat-tile__number')).toHaveTextContent(figure?.number ?? '')
      expect(tile.querySelector('.stat-tile__unit')).toHaveTextContent(figure?.unit ?? '')
      // The name says it is an estimate, and how it was worked out is one tap down: the tile carries no chip.
      expect(tile).not.toHaveTextContent(/Estimated|At least|Not all-out|Hard effort/)
      const range = thresholdRange(result, sport, SAMPLE_SETTINGS.massKg, 'metric')
      expect(range).toMatch(/^Range /)
      fireEvent.click(within(tile).getByRole('button', { name: /^How this was worked out/ }))
      // A range the page states is the range the tile's detail opens with, in the sport's own unit.
      expect(within(tile).getByRole('note')).toHaveTextContent(new RegExp(`^${range}\\. `))
    }
  })

  it('reads the run’s figure from its threshold estimate, not from its critical-power fit', () => {
    // The fit says 4.0 W/kg (23:23 /km); the estimate says 16, a different pace.
    const result = makeResult({ runThreshold: makeRunThreshold(16) })
    const { container } = renderTiles({ result, library: result.activities })
    const tile = screen.getByRole('article', { name: 'Run threshold' })
    expect(tile.querySelector('.stat-tile__number')).toHaveTextContent('4:24')
    expect(tile.querySelector('.stat-tile__unit')).toHaveTextContent('/km')
    expect(container.textContent).not.toMatch(/23:23/)
  })

  it('says what a threshold rests on, in one line under its figure, for a ride and for a run', () => {
    renderTiles()
    const ride = screen.getByRole('article', { name: 'Ride threshold' })
    expect(ride.querySelector('.stat-tile__source')).toHaveTextContent(
      /^From \d+ rides\. Strongest: \d+ min on \d+ \w+( \d{4})?\. How this was worked out/,
    )
    const run = screen.getByRole('article', { name: 'Run threshold' })
    expect(run.querySelector('.stat-tile__source')).toHaveTextContent(
      /^From \d+ runs\. Strongest: \d+ min on \d+ \w+( \d{4})?\. How this was worked out/,
    )
  })

  it('gives the ride’s threshold its watts per kilogram beside the figure', () => {
    renderTiles()
    const tile = screen.getByRole('article', { name: 'Ride threshold' })
    expect(tile.querySelector('.stat-tile__side')?.textContent).toMatch(/W\/kg$/)
  })

  it('says each sport’s level and grade on its tile, at threshold, and no line of the best 20 min of its own', () => {
    renderTiles()
    const run = screen.getByRole('article', { name: 'Run threshold' })
    expect(run).toHaveTextContent(/\w+ · \d+% at threshold\./)
    expect(run).not.toHaveTextContent(/Best 20 min:/)
    const ride = screen.getByRole('article', { name: 'Ride threshold' })
    expect(ride).toHaveTextContent(/\w+ · \d+% at threshold\./)
    expect(ride).not.toHaveTextContent(/Best 20 min:/)
    // The grade line keeps the level and the percent; the ride's range and its estimate are one tap down.
    const lines = [...ride.querySelectorAll('.stat-tile__line')].map((line) => line.textContent)
    expect(lines.at(-1)).toMatch(/^\w+ · \d+% at threshold\./)
  })

  it('holds the ride’s tiles for the weight', () => {
    const { container } = renderTiles({ weighted: false })
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toHaveTextContent(
      /Add your weight on/,
    )
    expect(screen.getByRole('article', { name: 'Your ride as a run' })).toHaveTextContent(
      /Add your weight on/,
    )
    // Only the run's threshold has a figure, so it alone has a detail to open, and no tile has a chip.
    expect(container.textContent).not.toMatch(/Estimated|At least/)
    expect(container.querySelectorAll('.stat-tile__effort')).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /^How this was worked out/ })).toHaveLength(1)
  })

  it('puts a prompt in the empty sport’s place, and leaves the ride as a run out', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const { container } = render(
      <BalanceTiles
        result={makeResult({ activities: [run] })}
        library={[run]}
        units="metric"
        massKg={75}
        grades={{ run: null, ride: null }}
        weighted
        period={PERIOD}
        onAddFiles={vi.fn()}
      />,
    )
    expect(container.querySelector('.balance-tiles')).toHaveAttribute('data-tiles', '2')
    expect(screen.getByRole('region', { name: 'Ride' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rides' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Your ride as a run' })).toBeNull()
  })

  it('draws no tile, and no empty section, for a lone sport whose headline already says what it needs', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const { container } = render(
      <BalanceTiles
        result={makeResult({ activities: [run], runCp: null })}
        library={[run]}
        units="metric"
        massKg={75}
        grades={{ run: null, ride: null }}
        weighted
        period={PERIOD}
        onAddFiles={vi.fn()}
        soleSport="run"
      />,
    )
    expect(screen.queryByRole('article', { name: 'Run threshold' })).toBeNull()
    expect(container.querySelector('.balance-tiles')).toBeNull()
  })

  it('says what a missing threshold needs, in the tile, and draws no figure', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const { container } = render(
      <BalanceTiles
        result={makeResult({ activities: [run, ride], runCp: null, rideCp: null })}
        library={[run, ride]}
        units="metric"
        massKg={75}
        grades={{ run: null, ride: null }}
        weighted
        period={PERIOD}
        onAddFiles={vi.fn()}
      />,
    )
    const tile = screen.getByRole('article', { name: 'Run threshold' })
    expect(tile.querySelector('.stat-tile__line')).toHaveTextContent(
      'Needs an effort of 8 min or longer',
    )
    const rideTile = screen.getByRole('article', { name: 'Ride threshold' })
    expect(rideTile.querySelector('.stat-tile__line')).toHaveTextContent(
      'Needs an effort of 3 min or longer',
    )
    expect(container.querySelectorAll('.stat-tile__number')).toHaveLength(0)
  })

  it('gives each threshold no chip, one detail one tap down, and the ride as a run needs none', () => {
    const { container } = renderTiles()
    expect(container.textContent).not.toMatch(/Estimated|At least/)
    expect(container.querySelectorAll('.stat-tile__effort')).toHaveLength(0)
    for (const name of ['Run threshold', 'Ride threshold']) {
      const tile = screen.getByRole('article', { name })
      expect(tile.querySelectorAll('.definition__term')).toHaveLength(1)
      expect(tile.querySelector('.definition__term')).toHaveTextContent('How this was worked out')
    }
    const asRun = screen.getByRole('article', { name: 'Your ride as a run' })
    expect(asRun).not.toHaveTextContent(/Estimated|At least/)
    expect(asRun.querySelector('.stat-tile__effort')).toBeNull()
  })
})
