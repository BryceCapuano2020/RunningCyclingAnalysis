// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { EffortCheck } from '@rca/core/types'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  makeActivity,
  makeResult,
  makeRideThreshold,
} from '../components/fixtures'
import type { GradeOutcome } from '../grades'
import { THRESHOLD_MEANING } from '../sports'
import { ThresholdTile } from './ThresholdTile'
import { thresholdTileIsBare } from './thresholdTileBare'

afterEach(cleanup)

function renderTile(
  sport: 'run' | 'ride',
  result: AnalysisResult,
  grade: GradeOutcome | null = null,
  weighted = true,
  effort: EffortCheck | null = null,
) {
  return render(
    <ThresholdTile
      sport={sport}
      result={result}
      units="metric"
      massKg={75}
      grade={grade}
      weighted={weighted}
      effort={effort}
    />,
  )
}

const FIT = { cp: 4.0, wPrime: 20, r2: 0.99, nPoints: 6 }

/** A graded run, as the page grades it: Local at 64%, one recorded effort. */
const RUN_GRADED: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: { centre: { grade: 0.64, level: 'Local' }, range: null },
}
/** A graded ride: Recreational to Local, with its model range. */
const RIDE_GRADED: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: {
    centre: { grade: 0.58, level: 'Recreational' },
    range: {
      low: { grade: 0.52, level: 'Recreational' },
      high: { grade: 0.63, level: 'Local' },
    },
  },
}

describe('ThresholdTile', () => {
  it('draws a fit’s standard-error range as a range, lighter than a 90% range', () => {
    const { container } = renderTile('run', makeResult({ runCp: { ...FIT, cpSe: 0.05 } }))
    const track = container.querySelector('.range-track')
    expect(track).toHaveClass('range-track--spread')
    expect(container.querySelector('.range-track__label')).toHaveTextContent('range')
    expect(container.textContent).not.toMatch(/90% range/)
  })

  it('draws no track, and no NaN, when the range’s two ends print the same', () => {
    // The fit’s range always has a model error floor, so only a range between two fits can collapse to one number.
    const same = {
      fit: { ...FIT, cpSe: 0.05, cp: FIT.cp + 1e-9 },
      leftOutS: [900],
      floor: FIT.cp - 0.5,
    }
    const { container } = renderTile('run', makeResult({ runCpUneven: same }))
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.textContent).not.toMatch(/NaN/)
    expect(container.querySelector('.stat-tile__number')).not.toBeNull()
  })

  it('renders nothing when it would hold only its name: no figure, the headline says what it needs, no grade', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const result = makeResult({ activities: [run], runCp: null })
    const props = {
      sport: 'run' as const,
      result,
      units: 'metric' as const,
      massKg: 75,
      grade: null,
      weighted: true,
    }
    const alone = render(<ThresholdTile {...props} needInHeadline />)
    expect(alone.container).toBeEmptyDOMElement()
    expect(thresholdTileIsBare({ ...props, needInHeadline: true })).toBe(true)
    // Where the headline does not say it, the tile does, so it is not bare.
    cleanup()
    const said = render(<ThresholdTile {...props} />)
    expect(said.container.querySelector('.stat-tile__line')).toHaveTextContent(/^Needs /)
    expect(thresholdTileIsBare(props)).toBe(false)
  })

  it('shows the floor of the efforts a refused fit left out, as At least, with no track', () => {
    const { container } = renderTile(
      'run',
      makeResult({
        runCp: null,
        runCpRefusal: 'shape',
        runCpUneven: {
          fit: { ...FIT, cp: 4.4, cpSe: 0.05 },
          leftOutS: [180],
          floor: 4.1,
        },
      }),
    )
    expect(screen.getByText('At least')).toBeInTheDocument()
    expect(container.querySelector('.stat-tile__basis')).toHaveClass('stat-tile__basis--floor')
    expect(container.querySelector('.stat-tile__number')).not.toBeNull()
    // A floor is a held best, not an estimate, and has no spread to draw.
    expect(container.querySelector('.range-track')).toBeNull()
    expect(screen.queryByText('Estimated')).toBeNull()
  })

  it('defines the threshold in place, with its meaning in plain words, for each sport, where there is no fit', () => {
    const unfitted = {
      run: makeResult({ runCp: null, runCpRefusal: 'missing' }),
      ride: makeResult({ rideCp: null, rideCpRefusal: 'missing' }),
    }
    for (const sport of ['run', 'ride'] as const) {
      const { container, unmount } = renderTile(sport, unfitted[sport])
      const button = screen.getByRole('button', { name: 'threshold' })
      fireEvent.click(button)
      expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toHaveTextContent(
        THRESHOLD_MEANING[sport],
      )
      expect(container.querySelector('article')).toHaveAttribute(
        'aria-label',
        `${sport === 'run' ? 'Run' : 'Ride'} threshold`,
      )
      unmount()
    }
  })

  it('leaves the word undefined where there is a fit, whose title names it, so the screen defines it less', () => {
    const { container } = renderTile('run', makeResult())
    expect(container.querySelector('.stat-tile__number')).not.toBeNull()
    expect(container.querySelector('article')).toHaveAttribute('aria-label', 'Run threshold')
    expect(screen.queryByRole('button', { name: 'threshold' })).toBeNull()
  })

  it('gives a ride one number with its W/kg, a line of what it rests on, and its range one tap down', () => {
    const rideThreshold = makeRideThreshold(15.5, {
      low: 14.9,
      high: 16.4,
      efforts: {
        value: 15,
        relativeError: 0.025,
        rides: 5,
        strongest: { activityId: 'ride-1', durationS: 720, estimated: false },
      },
      heartRate: { refused: 'stuck' },
    })
    const ride = makeActivity({
      id: 'ride-1',
      sport: 'ride',
      startMs: new Date(2026, 2, 4, 12).getTime(),
    })
    const { container } = renderTile('ride', makeResult({ activities: [ride], rideThreshold }))
    expect(container.querySelector('.stat-tile__number')).toHaveTextContent('250')
    expect(container.querySelector('.stat-tile__side')).toHaveTextContent('3.3 W/kg')
    expect(container.querySelector('.stat-tile__source')).toHaveTextContent(
      /^From 5 rides\. Strongest: 12 min on 4 Mar/,
    )
    expect(container.querySelector('.range-track, .stat-tile__basis, .chip')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    expect(screen.getByRole('note')).toHaveTextContent(/^Range 240 to 264 W\. /)
    expect(screen.getByRole('note')).toHaveTextContent(
      'Here it was not used: your heart rate does not move with power.',
    )
  })

  it('carries no effort chip: a run’s heart-rate reading is in its detail, and a ride’s estimate does not read it', () => {
    const check = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 }
    renderTile('run', makeResult(), null, true, check)
    expect(screen.queryByRole('button', { name: /Not all-out|Hard effort/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    expect(screen.getByRole('note')).toHaveTextContent(
      /^Fitted to your best 3 to 20 min efforts\. Your best 20 min running reached 70% of your running max heart rate/,
    )
    cleanup()
    renderTile('ride', makeResult(), null, true, check)
    expect(screen.queryByRole('button', { name: /Not all-out|Hard effort/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    expect(screen.getByRole('note')).not.toHaveTextContent(/max heart rate/)
  })

  it('has no detail on a run’s tile when heart rate cannot judge its effort: the fit alone is the Method page’s', () => {
    const { container } = renderTile('run', makeResult())
    expect(container.querySelector('.stat-tile__number')).not.toBeNull()
    expect(container.querySelector('.stat-tile__source')).toBeNull()
    expect(screen.queryByRole('button', { name: /^How this was worked out/ })).toBeNull()
  })

  it('names each tile’s detail for its threshold, so two on a page are told apart', () => {
    const check = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 }
    renderTile('run', makeResult(), null, true, check)
    expect(
      screen.getByRole('button', { name: 'How this was worked out for threshold pace' }),
    ).toHaveTextContent('How this was worked out')
    cleanup()
    renderTile('ride', makeResult())
    expect(
      screen.getByRole('button', { name: 'How this was worked out for threshold power' }),
    ).toHaveTextContent('How this was worked out')
  })

  describe('one status to a card', () => {
    /** The statuses a tile shows: its basis chip, and any effort chip. */
    const statuses = (container: HTMLElement) =>
      [
        ...container.querySelectorAll('.stat-tile__basis, .stat-tile__effort .definition__term'),
      ].map((chip) => chip.textContent)
    const HARD = { durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.95 }
    const EASY = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.7 }
    const floored = makeResult({
      runCp: null,
      runCpRefusal: 'shape',
      runCpUneven: { fit: { ...FIT, cp: 4.4, cpSe: 0.05 }, leftOutS: [180], floor: 4.1 },
    })

    it.each(['run', 'ride'] as const)(
      'gives a fitted %s threshold no status at all, whatever its effort was',
      (sport) => {
        for (const check of [null, EASY, HARD]) {
          const { container, unmount } = renderTile(sport, makeResult(), null, true, check)
          expect(container.querySelector('.stat-tile__number')).not.toBeNull()
          expect(statuses(container)).toEqual([])
          unmount()
        }
      },
    )

    it('keeps At least on a run floor and drops the effort beside it, whatever the effort', () => {
      for (const check of [EASY, HARD]) {
        const { container, unmount } = renderTile('run', floored, null, true, check)
        expect(statuses(container)).toEqual(['At least'])
        expect(screen.queryByRole('button', { name: /effort|all-out|worked out/ })).toBeNull()
        unmount()
      }
    })

    it('gives a ride no floor: with no estimate it asks for an effort, whatever the gate holds', () => {
      const held = makeResult({
        rideCp: null,
        rideCpRefusal: 'shape',
        effortGate: {
          ...makeResult().effortGate,
          ride: { ...makeResult().effortGate.ride, floor: { durationS: 1800, value: 3.9 } },
        },
      })
      const { container } = renderTile('ride', held)
      expect(container.querySelector('.stat-tile__number')).toBeNull()
      expect(statuses(container)).toEqual([])
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        'Needs an effort of 3 min or longer',
      )
    })
  })

  it('names the tile by its words alone, whatever the definition inside it says', () => {
    renderTile('ride', makeResult())
    expect(screen.getByRole('article', { name: 'Ride threshold' })).toBeInTheDocument()
  })

  it('says what a ride held for the weight can say without it: its count, time and latest date, then the ask', () => {
    const rides = [
      makeActivity({ id: 'ride-1', sport: 'ride', durationS: 3600 }),
      makeActivity({ id: 'ride-2', sport: 'ride', durationS: 5400 }),
    ]
    const { container } = renderTile('ride', makeResult({ activities: rides }), null, false)
    const tile = screen.getByRole('article', { name: 'Ride threshold' })
    expect(tile).toHaveTextContent(/2 rides, 2 h 30 min riding\. Latest .+\./)
    expect(tile).toHaveTextContent(
      'Add your weight on Profile to grade your rides and see their figures.',
    )
    // Nothing is estimated, so the tile has no chip and no figure.
    expect(container.querySelector('.stat-tile__figure')).toBeNull()
  })

  it('leaves the facts out of a held tile for a sport with no activities, keeping the ask', () => {
    renderTile(
      'ride',
      makeResult({ activities: [makeActivity({ id: 'run-1', sport: 'run' })] }),
      null,
      false,
    )
    const tile = screen.getByRole('article', { name: 'Ride threshold' })
    expect(tile).not.toHaveTextContent(/riding/)
    expect(tile).toHaveTextContent('Add your weight on Profile')
  })

  it('still offers the definition where the threshold is held or waiting', () => {
    renderTile('ride', makeResult(), null, false)
    expect(screen.getByRole('button', { name: 'threshold' })).toBeInTheDocument()
    cleanup()
    renderTile('run', makeResult({ runCp: null, runCpRefusal: 'missing' }))
    expect(screen.getByRole('button', { name: 'threshold' })).toBeInTheDocument()
  })

  describe('the grade line', () => {
    const activities = [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' }),
    ]

    it('gives the level, the grade and the effort it rests on, for a run read as recorded', () => {
      const result = makeResult({
        activities,
        runCp: { ...FIT, cpSe: 0.05, cp: FIVE_K_IN_20_MIN_WKG + 1 },
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      })
      const { container } = renderTile('run', result, RUN_GRADED)
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        /^Local · 64% on your best 20 min, \d+:\d{2} \/km\.$/,
      )
    })

    it('has no “Best 20 min” line of its own, whether the best sits above the threshold or below it', () => {
      for (const cp of [FIVE_K_IN_20_MIN_WKG - 1, FIVE_K_IN_20_MIN_WKG + 1]) {
        const result = makeResult({
          activities,
          runCp: { ...FIT, cpSe: 0.05, cp },
          runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
        })
        const { container } = renderTile('run', result, RUN_GRADED)
        const lines = [...container.querySelectorAll('.stat-tile__line')].map((l) => l.textContent)
        expect(lines).toEqual([expect.stringMatching(/^Local · 64% on your best 20 min, /)])
        expect(container.textContent).not.toMatch(/Best 20 min:/)
        cleanup()
      }
    })

    it('keeps no line under a tile whose levels row already gives the level and grade', () => {
      const result = makeResult({
        activities,
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      })
      const { container } = render(
        <ThresholdTile
          sport="run"
          result={result}
          units="metric"
          massKg={75}
          grade={RUN_GRADED}
          weighted
          levelShown
        />,
      )
      expect(container.querySelector('.stat-tile__number')).not.toBeNull()
      expect(container.querySelector('.stat-tile__line')).toBeNull()
      expect(container.textContent).not.toMatch(/Best 20 min/)
    })

    it('leaves what a threshold is to its title, with no line under the name', () => {
      for (const sport of ['run', 'ride'] as const) {
        const tile = renderTile(sport, makeResult()).container.querySelector('article')!
        expect(tile).toHaveAttribute('aria-label', `${sport === 'run' ? 'Run' : 'Ride'} threshold`)
        expect(tile.querySelector('.stat-tile__head')?.nextElementSibling).toBe(
          tile.querySelector('.stat-tile__figure'),
        )
        expect(tile).not.toHaveTextContent(/you could hold/)
        cleanup()
      }
    })

    it('writes the ride’s grade line as its level and percent with plain watts, and keeps the range and the estimate off it', () => {
      const result = makeResult({
        activities,
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 246, 'ride-1')],
      })
      const { container } = renderTile('ride', result, RIDE_GRADED)
      expect(container.querySelector('.stat-tile__line')?.textContent).toBe(
        'Recreational · 58% on your best 20 min, 246 W.',
      )
    })

    it('writes watts a power meter measured the same way: the grade line does not say which they were', () => {
      const result = makeResult({
        activities: [activities[0]!, { ...activities[1]!, powerSource: 'measured' }],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 246, 'ride-1')],
      })
      const { container } = renderTile('ride', result, RIDE_GRADED)
      expect(container.querySelector('.stat-tile__line')?.textContent).toBe(
        'Recreational · 58% on your best 20 min, 246 W.',
      )
    })

    it('says the reason there is no grade, in place of the line, when the grade is a gap', () => {
      const gap: GradeOutcome = { kind: 'gap', reason: 'Age grade needs a best 20 min effort.' }
      const { container } = renderTile('run', makeResult({ activities }), gap)
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        'Age grade needs a best 20 min effort.',
      )
    })

    it('has no grade line while the year of birth or sex is missing', () => {
      const { container } = renderTile('run', makeResult({ activities }), null)
      expect(container.querySelector('.stat-tile__line')).toBeNull()
    })
  })
})
