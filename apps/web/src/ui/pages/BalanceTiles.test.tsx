// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import type { Period } from '@rca/core/period'
import { makeActivity, makeResult } from '../components/fixtures'
import { headlineGrades } from '../grades'
import { threshold } from '../records'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { thresholdRange } from '../thresholdRange'
import { BalanceTiles } from './BalanceTiles'
import { RangeTrack } from './RangeTrack'

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

describe('RangeTrack', () => {
  it('draws the range as a shape, with its ends printed and a ring where the estimate sits', () => {
    const { container } = render(<RangeTrack ends={['7:07', '7:18']} at={0.5} label="range" />)
    expect(container.querySelector('.range-track__bar')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.range-track__band')).not.toBeNull()
    expect(container.querySelectorAll('.range-track__cap')).toHaveLength(2)
    const printed = container.querySelectorAll('.range-track__ends > [aria-hidden="true"]')
    expect([...printed].map((node) => node.textContent)).toEqual(['7:07', 'range', '7:18'])
  })

  it('reads the range as one phrase, not as three loose figures', () => {
    const { container } = render(<RangeTrack ends={['6', '16']} at={0.5} label="90% range" />)
    expect(container.querySelector('.range-track__ends .sr-only')?.textContent).toBe(
      '90% range 6 to 16',
    )
  })

  it('places the ring at its share of the band, and holds it inside the band', () => {
    const at = (value: number) => {
      const { container } = render(<RangeTrack ends={['a', 'b']} at={value} label="range" />)
      return (container.firstElementChild as HTMLElement).style.getPropertyValue('--at')
    }
    expect(at(0.5)).toBe('50%')
    expect(at(0)).toBe('22%')
    expect(at(1)).toBe('78%')
    expect(at(-3)).toBe('22%')
    expect(at(4)).toBe('78%')
  })
})

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

  it('writes each threshold exactly as the sport cards did, with its range as a track and an estimated chip', () => {
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
      expect(within(tile).getByText('Estimated')).toBeInTheDocument()
      const range = thresholdRange(result, sport, SAMPLE_SETTINGS.massKg, 'metric')
      // A range the page states is a range the tile draws, and its ends are the numbers the line named.
      expect(tile.querySelector('.range-track') !== null).toBe(range !== null)
      if (range !== null) {
        const ends = Array.from(tile.querySelectorAll('.range-track__ends span')).map(
          (span) => span.textContent,
        )
        expect(range).toContain(ends[0])
        expect(range).toContain(ends[2])
      }
    }
  })

  it('gives the ride’s threshold its watts per kilogram beside the figure', () => {
    renderTiles()
    const tile = screen.getByRole('article', { name: 'Ride threshold' })
    expect(tile.querySelector('.stat-tile__side')?.textContent).toMatch(/W\/kg$/)
  })

  it('says each sport’s level and grade on its tile, with the effort it rests on', () => {
    renderTiles()
    // The run's best 20 min is faster than its threshold, so its figure has its own line, said once.
    const run = screen.getByRole('article', { name: 'Run threshold' })
    expect(run).toHaveTextContent(/Best 20 min: \d+:\d{2} \/km/)
    expect(run).toHaveTextContent(/\w+ · \d+% on your best 20 min\./)
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toHaveTextContent(
      /Best 20 min: \d+ W.*\d+% \(\d+ to \d+\) on your best 20 min\./,
    )
  })

  it('holds the ride’s tiles for the weight', () => {
    const { container } = renderTiles({ weighted: false })
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toHaveTextContent(
      /Add your weight on/,
    )
    expect(screen.getByRole('article', { name: 'Your ride as a run' })).toHaveTextContent(
      /Add your weight on/,
    )
    // Only the run's threshold has a figure, so it alone says what kind of evidence it is.
    expect(container.querySelectorAll('.stat-tile__basis')).toHaveLength(1)
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

  it('says what a missing threshold needs, in the tile, with no range shape', () => {
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
    expect(tile.querySelector('.stat-tile__line')).toHaveTextContent(/^Needs /)
    expect(tile.querySelector('.range-track')).toBeNull()
    // With no figure there is nothing for a chip to say the evidence of.
    expect(tile.querySelector('.stat-tile__basis')).toBeNull()
    expect(container.querySelectorAll('.stat-tile__number')).toHaveLength(0)
  })

  it('names each threshold’s evidence with a chip, a ring for an estimate, and the ride as a run needs none', () => {
    const { container } = renderTiles()
    expect(container.querySelectorAll('.stat-tile__basis--estimated')).toHaveLength(2)
    expect(container.querySelectorAll('.stat-tile__basis')).toHaveLength(2)
    const asRun = screen.getByRole('article', { name: 'Your ride as a run' })
    expect(asRun.querySelector('.stat-tile__basis')).toBeNull()
  })
})
