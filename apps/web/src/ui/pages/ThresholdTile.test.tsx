// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
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
) {
  return render(
    <ThresholdTile
      sport={sport}
      result={result}
      units="metric"
      massKg={75}
      grade={grade}
      weighted={weighted}
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
  it('says a run’s range in words one tap down, and draws no shape or label beside the figure', () => {
    const runThreshold = makeRunThreshold(16, { low: 15.2, high: 16.8 })
    const { container } = renderTile('run', makeResult({ runThreshold }))
    expect(container.querySelector('.stat-tile__figure')).toHaveTextContent('4:24')
    expect(container.textContent).not.toMatch(/90% range|Estimated|At least/)
    expect(screen.queryByText('range')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    expect(screen.getByRole('note')).toHaveTextContent(/^Range 4:10 to 4:39 \/km\. /)
  })

  it('says “About” and prints no NaN when the range’s two ends print the same', () => {
    const same = makeRunThreshold(16, { low: 16, high: 16 })
    const { container } = renderTile('run', makeResult({ runThreshold: same }))
    expect(container.textContent).not.toMatch(/NaN/)
    expect(container.querySelector('.stat-tile__number')).toHaveTextContent('4:24')
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    expect(screen.getByRole('note')).toHaveTextContent(/^About 4:24 \/km\. /)
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

  it('shows the estimate whatever the critical-power fit says, and a refused fit puts no floor or label in its place', () => {
    const { container } = renderTile(
      'run',
      makeResult({
        runCp: null,
        runCpRefusal: 'shape',
        runCpUneven: { fit: { ...FIT, cp: 4.4, cpSe: 0.05 }, leftOutS: [180], floor: 4.1 },
        runThreshold: makeRunThreshold(16),
      }),
    )
    expect(container.querySelector('.stat-tile__number')).toHaveTextContent('4:24')
    expect(container.textContent).not.toMatch(/At least|Estimated|From your best/)
    expect(container.querySelector('.stat-tile__source')).toHaveTextContent(/^From 3 runs\. /)
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
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).not.toMatch(/Estimated|At least/)
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    expect(screen.getByRole('note')).toHaveTextContent(/^Range 240 to 264 W\. /)
    expect(screen.getByRole('note')).toHaveTextContent(
      'Here it was not used: your heart rate does not move with power.',
    )
  })

  it('gives a run the same one-tap detail as a ride: its range and method, and nothing about heart rate', () => {
    const run = makeActivity({
      id: 'run-1',
      sport: 'run',
      startMs: new Date(2026, 2, 4, 12).getTime(),
    })
    const runThreshold = makeRunThreshold(16, {
      efforts: {
        value: 16,
        relativeError: 0.03,
        rides: 4,
        strongest: { activityId: 'run-1', durationS: 2400, estimated: false },
      },
    })
    const { container } = renderTile('run', makeResult({ activities: [run], runThreshold }))
    expect(container.querySelector('.stat-tile__source')).toHaveTextContent(
      /^From 4 runs\. Strongest: 40 min on 4 Mar/,
    )
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(
      /^Range 4:\d\d to 4:\d\d \/km\. Worked out from the strongest effort of each run/,
    )
    expect(note).toHaveTextContent('never under an hour you ran')
    expect(note).not.toHaveTextContent(/heart rate|max heart|not used|raise/i)
  })

  it('names each tile’s detail for its threshold, so two on a page are told apart', () => {
    renderTile('run', makeResult())
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
    /** The statuses a tile could show: a chip's words, or any chip or ring at all. */
    const STATUS = /Estimated|At least|Recorded|Not all-out|Hard effort/
    const floored = makeResult({
      runCp: null,
      runCpRefusal: 'shape',
      runCpUneven: { fit: { ...FIT, cp: 4.4, cpSe: 0.05 }, leftOutS: [180], floor: 4.1 },
      runThreshold: makeRunThreshold(16),
    })

    it.each(['run', 'ride'] as const)('gives a %s threshold no status at all', (sport) => {
      const { container } = renderTile(sport, makeResult())
      expect(container.querySelector('.stat-tile__number')).not.toBeNull()
      expect(container.textContent).not.toMatch(STATUS)
      expect(container.querySelector('.chip, .tag--small')).toBeNull()
      expect(container.querySelectorAll('.stat-tile__head > *')).toHaveLength(2)
    })

    it('gives a run whose fit was refused its estimate and the same lack of status', () => {
      const { container } = renderTile('run', floored)
      expect(container.querySelector('.stat-tile__number')).toHaveTextContent('4:24')
      expect(container.textContent).not.toMatch(STATUS)
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
      expect(container.textContent).not.toMatch(STATUS)
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        'Needs an effort of 3 min or longer',
      )
    })

    it('asks a run with no estimate for an 8 min effort, not the 3 min a ride needs', () => {
      const { container } = renderTile('run', makeResult({ runCp: null, runCpRefusal: 'missing' }))
      expect(container.querySelector('.stat-tile__number')).toBeNull()
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        'Needs an effort of 8 min or longer',
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
