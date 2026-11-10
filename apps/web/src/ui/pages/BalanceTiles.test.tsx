// @vitest-environment jsdom
import { headlineGrades } from '../test/balanceFixtures'
import '../../test/warmSample'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import type { Period } from '@rca/core/period'
import { makeActivity, makeResult, makeRunThreshold } from '../components/test/fixtures'
import { threshold } from '../records'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { thresholdSpan } from '../thresholdRange'
import { BalanceTiles } from './BalanceTiles'
import { detailSummaries, openDetail } from '../test/openDetail'
import { rowValue, rowsIn } from '../test/propertyRows'

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
  it('shows three tiles with both sports, each threshold and lifting, and none for the lean', () => {
    const { container } = renderTiles()
    expect(container.querySelector('.balance-tiles')).toHaveAttribute('data-tiles', '3')
    expect(screen.getAllByRole('article').map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Half-marathon',
      'Functional threshold power',
      'Big three total',
    ])
  })

  it('writes each threshold exactly as the sport cards do: no chip, the range in words one tap down, for a run as for a ride', () => {
    const { result } = sample()
    renderTiles()
    // The ride's row is its threshold power; the run's leads with its half marathon and keeps its pace one tap down.
    const run = screen.getByRole('article', { name: 'Half-marathon' })
    const pace = threshold(result, 'run', SAMPLE_SETTINGS.massKg, 'metric')
    openDetail(run)
    expect(rowValue(run, 'Threshold pace')).toBe(`${pace?.number} ${pace?.unit}`)
    expect(rowValue(run, 'Likely time')).toMatch(/^\d:\d\d:\d\d to \d:\d\d:\d\d$/)
    for (const [name, sport] of [['Functional threshold power', 'ride']] as const) {
      const tile = screen.getByRole('article', { name })
      const figure = threshold(result, sport, SAMPLE_SETTINGS.massKg, 'metric')
      expect(tile.querySelector('.stat-tile__number')).toHaveTextContent(figure?.number ?? '')
      expect(tile.querySelector('.stat-tile__unit')).toHaveTextContent(figure?.unit ?? '')
      // The name says it is an estimate, and how it was worked out is one tap down: the tile carries no chip.
      expect(tile).not.toHaveTextContent(/Estimated|At least|Not all-out|Hard effort/)
      const range = thresholdSpan(result, sport, SAMPLE_SETTINGS.massKg, 'metric')
      expect(range).toMatch(/\u2013/)
      openDetail(tile)
      // A range the page states is the range the tile's detail opens with, in the sport's own unit, as a row.
      expect(rowValue(tile, 'Range')).toBe(range)
      expect(rowValue(tile, 'Rides used')).toMatch(/^\d+$/)
      expect(rowValue(tile, 'Strongest effort')).toMatch(/^\d+ min, \d+ \w+( \d{4})?$/)
      // No line sits under the figure: the basis is inside the disclosure only.
      expect(tile.querySelectorAll('.stat-tile__source > p')).toHaveLength(0)
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

  it('says what a threshold rests on in its detail’s rows, for a ride and for a run, and nothing under the figure', () => {
    renderTiles()
    const ride = screen.getByRole('article', { name: 'Functional threshold power' })
    expect(rowsIn(ride).map(([label]) => label)).toEqual(
      expect.arrayContaining(['Rides used', 'Strongest effort', 'Range']),
    )
    expect(detailSummaries(ride)).toEqual(['Details for threshold power'])
    const run = screen.getByRole('article', { name: 'Half-marathon' })
    expect(rowsIn(run).map(([label]) => label)).toEqual([
      'Likely time',
      'Threshold pace',
      'Runs used',
      'Strongest effort',
    ])
    expect(detailSummaries(run)).toEqual(['Details for threshold pace'])
  })

  it('gives the ride its watts alone, the watts per kilogram one tap down', () => {
    renderTiles()
    const tile = screen.getByRole('article', { name: 'Functional threshold power' })
    expect(tile.querySelector('.stat-tile__side')?.textContent ?? '').toBe('')
    expect(tile.querySelector('.props')?.textContent).toMatch(/Per kilogram\s*[\d.]+ W\/kg/)
  })

  it('leads the run with its predicted half marathon, the threshold pace one tap down', () => {
    renderTiles()
    const tile = screen.getByRole('article', { name: 'Half-marathon' })
    expect(tile.querySelector('.stat-tile__number')?.textContent).toMatch(/^\d:\d\d:\d\d$/)
    expect(tile.querySelector('.props')?.textContent).toMatch(/Likely time.*Threshold pace/)
  })

  it('says each sport’s level and grade on its tile, at threshold, and no line of the best 20 min of its own', () => {
    renderTiles()
    const run = screen.getByRole('article', { name: 'Half-marathon' })
    expect(run).toHaveTextContent(/\w+ · \d+% at threshold\./)
    expect(run).not.toHaveTextContent(/Best 20 min:/)
    const ride = screen.getByRole('article', { name: 'Functional threshold power' })
    expect(ride).toHaveTextContent(/\w+ · \d+% at threshold\./)
    expect(ride).not.toHaveTextContent(/Best 20 min:/)
    // The grade line keeps the level and the percent; the ride's range and its estimate are one tap down.
    const lines = [...ride.querySelectorAll('.stat-tile__line')].map((line) => line.textContent)
    expect(lines.at(-1)).toMatch(/^\w+ · \d+% at threshold\./)
  })

  it('holds the ride’s tiles for the weight', () => {
    const { container } = renderTiles({ weighted: false })
    expect(screen.getByRole('article', { name: 'Functional threshold power' })).toHaveTextContent(
      /Add your weight on/,
    )
    // Lifting needs no weight to ask for a first lift.
    expect(screen.getByRole('article', { name: 'Big three total' })).toHaveTextContent(
      /Log a squat/,
    )
    // Only the run's threshold has a figure, so it alone has a detail to open, and no tile has a chip.
    expect(container.textContent).not.toMatch(/Estimated|At least/)
    expect(container.querySelectorAll('.stat-tile__effort')).toHaveLength(0)
    expect(detailSummaries(container)).toHaveLength(1)
  })

  it('puts a prompt in the empty sport’s place, and leaves lifting out with one sport and no lift', () => {
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
    expect(screen.queryByRole('article', { name: 'Big three total' })).toBeNull()
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
    expect(screen.queryByRole('article', { name: 'Half-marathon' })).toBeNull()
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
    const rideTile = screen.getByRole('article', { name: 'Functional threshold power' })
    expect(rideTile.querySelector('.stat-tile__line')).toHaveTextContent(
      'Needs an effort of 3 min or longer',
    )
    expect(container.querySelectorAll('.stat-tile__number')).toHaveLength(0)
  })

  it('gives each threshold no chip, and one detail one tap down', () => {
    const { container } = renderTiles()
    expect(container.textContent).not.toMatch(/Estimated|At least/)
    expect(container.querySelectorAll('.stat-tile__effort')).toHaveLength(0)
    for (const name of ['Half-marathon', 'Functional threshold power']) {
      const tile = screen.getByRole('article', { name })
      expect(detailSummaries(tile)).toHaveLength(1)
      expect(tile.querySelectorAll('.definition__term, .chip')).toHaveLength(0)
    }
  })

  it('gives lifting the third row with the big three as its figure and each lift in Details', () => {
    renderTiles({
      lift: {
        heading: 'Big three total',
        figure: { number: '310', unit: 'kg' },
        rows: [
          { label: 'Squat', value: '40% · 100\u00a0kg' },
          { label: 'Bench', value: '39% · 70\u00a0kg' },
        ],
      },
    })
    const tile = screen.getByRole('article', { name: 'Big three total' })
    expect(tile.querySelector('.stat-tile__number')).toHaveTextContent('310')
    expect(tile).toHaveTextContent('Squat40% · 100 kg')
    expect(tile.closest('li')).not.toHaveAttribute('data-sport')
  })

  it('gives a lone sport the lifting row when a lift has an estimate', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    render(
      <BalanceTiles
        result={makeResult({ activities: [run] })}
        library={[run]}
        units="metric"
        massKg={75}
        grades={{ run: null, ride: null }}
        weighted
        period={PERIOD}
        onAddFiles={vi.fn()}
        soleSport="run"
        lift={{
          heading: 'Deadlift, projected 1RM',
          figure: { number: '140', unit: 'kg' },
          rows: [{ label: 'Deadlift', value: '39% · 140\u00a0kg' }],
        }}
      />,
    )
    expect(screen.getByRole('article', { name: 'Deadlift, projected 1RM' })).toHaveTextContent(
      '140',
    )
  })
})
