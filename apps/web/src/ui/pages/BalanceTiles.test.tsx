// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import type { Period } from '@rca/core/period'
import { gapOfHeadline } from '../balanceGap'
import { gapReading } from '../components/balanceScale'
import { makeActivity, makeResult } from '../components/fixtures'
import { headlineGrades } from '../grades'
import { threshold } from '../records'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { thresholdRange } from '../thresholdRange'
import { BalanceTiles } from './BalanceTiles'
import { LeanTile } from './LeanTile'
import { RangeTrack } from './RangeTrack'

afterEach(cleanup)

const PERIOD: Period = { choice: 'all', startMs: null, endMs: null, days: null, fellBack: false }

function sample() {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  const { result } = state
  if (result === null) throw new Error('The sample has no result')
  const headline = headlineGrades(result, SAMPLE_PROFILE)
  const gap = gapOfHeadline(headline)
  if (gap === null) throw new Error('The sample has no gap')
  return { state, result, grades: { run: headline.run, ride: headline.ride }, gap }
}

function renderTiles(over: Partial<Parameters<typeof BalanceTiles>[0]> = {}) {
  const { state, result, grades, gap } = sample()
  return render(
    <BalanceTiles
      result={result}
      library={state.library}
      units="metric"
      massKg={SAMPLE_SETTINGS.massKg}
      grades={grades}
      weighted
      period={PERIOD}
      reading={gapReading(gap)}
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
    expect(container.querySelector('.range-track__ends')?.textContent).toBe('7:07range7:18')
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
  it('shows four tiles with both sports: each threshold, the lean, and the ride on foot', () => {
    const { container } = renderTiles()
    expect(container.querySelector('.balance-tiles')).toHaveAttribute('data-tiles', '4')
    expect(screen.getAllByRole('article').map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Run threshold',
      'Ride threshold',
      'Lean',
      'Ride on foot',
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
    expect(screen.getByRole('article', { name: 'Run threshold' })).toHaveTextContent(
      /\w+ · \d+% on your best 20 min, \d+:\d{2} \/km\./,
    )
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toHaveTextContent(
      /\d+% \(\d+–\d+%\) on your best 20 min, \d+ W/,
    )
  })

  it('sets the lean tile’s figure from the headline gap, signed, with its 90% range as a track', () => {
    const { gap } = sample()
    renderTiles()
    const tile = screen.getByRole('article', { name: 'Lean' })
    expect(tile.querySelector('.stat-tile__number')).toHaveTextContent(`+${Math.round(gap.centre)}`)
    expect(tile.querySelector('.stat-tile__unit')).toHaveTextContent('pts')
    expect(tile.querySelector('.stat-tile__side')).toHaveTextContent('toward running')
    expect(within(tile).getByText('90% range')).toBeInTheDocument()
    expect(within(tile).getByText('Estimated')).toBeInTheDocument()
  })

  it('does not repeat the level target on the lean tile, which the scale shows', () => {
    renderTiles()
    expect(screen.getByRole('article', { name: 'Lean' })).not.toHaveTextContent(
      /would need|to level/i,
    )
  })

  it('holds the ride’s tiles for the weight, and leaves the lean out', () => {
    const { container } = renderTiles({ weighted: false, reading: null })
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toHaveTextContent(
      /Add your weight on/,
    )
    expect(screen.queryByRole('article', { name: 'Lean' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Ride on foot' })).toHaveTextContent(
      /Add your weight on/,
    )
    // Only the run's threshold has a figure, so it alone says what kind of evidence it is.
    expect(container.querySelectorAll('.stat-tile__basis')).toHaveLength(1)
  })

  it('puts a prompt in the empty sport’s place, and leaves the lean and the ride on foot out', () => {
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
        reading={null}
        onAddFiles={vi.fn()}
      />,
    )
    expect(container.querySelector('.balance-tiles')).toHaveAttribute('data-tiles', '2')
    expect(screen.getByRole('region', { name: 'Ride' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rides' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Lean' })).toBeNull()
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
        reading={null}
        onAddFiles={vi.fn()}
      />,
    )
    const tile = screen.getByRole('article', { name: 'Run threshold' })
    expect(tile.querySelector('.stat-tile__line')).toHaveTextContent(/^Needs /)
    expect(tile.querySelector('.range-track')).toBeNull()
    // With no figure there is nothing for a chip to say the evidence of.
    expect(tile.querySelector('.stat-tile__basis')).toBeNull()
    expect(container.querySelectorAll('.stat-tile__number').length).toBeLessThan(4)
  })

  it('names each tile’s evidence with a chip: a ring for an estimate, an equivalent for the ride on foot', () => {
    const { container } = renderTiles()
    expect(container.querySelectorAll('.stat-tile__basis--estimated')).toHaveLength(3)
    expect(container.querySelectorAll('.stat-tile__basis--equivalent')).toHaveLength(1)
  })
})

describe('LeanTile caption', () => {
  const reading = (centre: number, low: number, high: number) =>
    ({
      unit: 'points',
      lean: centre > 2 ? 'run' : centre < -2 ? 'ride' : 'even',
      lead: { centre, low, high },
    }) as const

  it('says how far the run’s grade sits above the ride’s for a lean toward running', () => {
    render(<LeanTile reading={reading(6, 1, 12)} estimated />)
    expect(
      screen.getByText('How far your running grade sits above cycling’s, at your best 20 min.'),
    ).toBeInTheDocument()
  })

  it('reads a lean toward cycling from cycling’s side', () => {
    render(<LeanTile reading={reading(-6, -12, -1)} estimated />)
    expect(
      screen.getByText('How far your cycling grade sits above running’s, at your best 20 min.'),
    ).toBeInTheDocument()
    expect(document.querySelector('.stat-tile__number')).toHaveTextContent('+6')
  })

  it('names no side for a gap of nothing', () => {
    render(<LeanTile reading={reading(0, -3, 3)} estimated />)
    expect(
      screen.getByText('How far apart your running and cycling grades sit, at your best 20 min.'),
    ).toBeInTheDocument()
  })

  it('never says ahead of', () => {
    const { container } = render(<LeanTile reading={reading(6, 1, 12)} estimated />)
    expect(container.textContent).not.toMatch(/ahead of/i)
  })
})
