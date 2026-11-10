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
import { detailSummaries, openDetail } from '../test/openDetail'
import { rowValue } from '../test/propertyRows'

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

/** The panel inside a tile's Details: the rows, never a line under the figure. */
function panelOf(container: HTMLElement): Element {
  const panel = container.querySelector('.stat-tile__source details .props')
  expect(panel?.closest('details')).not.toBeNull()
  return panel!
}

describe('ThresholdTile', () => {
  it('says a run’s range in words one tap down, and draws no shape or label beside the figure', () => {
    const runThreshold = makeRunThreshold(16, { low: 15.2, high: 16.8 })
    const { container } = renderTile('run', makeResult({ runThreshold }))
    expect(container.querySelector('.stat-tile__figure')).toHaveTextContent('4:24')
    expect(container.textContent).not.toMatch(/90% range|Estimated|At least/)
    expect(screen.queryByText('range')).toBeNull()
    openDetail()
    expect(rowValue(document.body, 'Range')).toBe('4:10\u20134:39 /km')
  })

  it('emits the figure, second-reading and trend cells even with no second reading, so its figure keeps the column', () => {
    const { container } = renderTile('run', makeResult({ runThreshold: makeRunThreshold(16) }))
    const tile = container.querySelector('.stat-tile')!
    const cells = [...tile.children].map((child) => child.className.split(' ')[0])
    expect(cells).toEqual(['row__body', 'row__figure', 'row__sub', 'row__spark'])
    expect(tile.querySelector('.row__sub')).toBeEmptyDOMElement()
  })

  it('says “About” and prints no NaN when the range’s two ends print the same', () => {
    const same = makeRunThreshold(16, { low: 16, high: 16 })
    const { container } = renderTile('run', makeResult({ runThreshold: same }))
    expect(container.textContent).not.toMatch(/NaN/)
    expect(container.querySelector('.stat-tile__number')).toHaveTextContent('4:24')
    openDetail()
    expect(rowValue(document.body, 'Range')).toBe('4:24 /km')
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
    expect(rowValue(panelOf(container), 'Runs used')).toBe('3')
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
    const panel = panelOf(container)
    expect(rowValue(panel, 'Rides used')).toBe('5')
    expect(rowValue(panel, 'Strongest effort')).toBe('12 min, 4 Mar')
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).not.toMatch(/Estimated|At least/)
    openDetail()
    expect(rowValue(panel, 'Range')).toBe('240\u2013264 W')
    expect(rowValue(panel, 'Heart rate')).toBe('Not used')
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
    const panel = panelOf(container)
    expect(rowValue(panel, 'Runs used')).toBe('4')
    expect(rowValue(panel, 'Strongest effort')).toBe('40 min, 4 Mar')
    expect(rowValue(panel, 'Range')).toMatch(/^4:\d\d\u20134:\d\d \/km$/)
    expect(panel).not.toHaveTextContent(/heart rate|max heart|not used|raise/i)
    // The method itself is one link to Method, not prose in the panel.
    expect(panel.querySelector('.props__method')).toHaveTextContent('Method')
  })

  it('names each tile’s detail for its threshold, so two on a page are told apart', () => {
    renderTile('run', makeResult())
    expect(detailSummaries()).toEqual(['Details for threshold pace'])
    // The words that tell the two apart are for a screen reader; the eye reads the title above.
    expect(document.querySelector('details > summary .sr-only')).toHaveTextContent(
      'for threshold pace',
    )
    cleanup()
    renderTile('ride', makeResult())
    expect(detailSummaries()).toEqual(['Details for threshold power'])
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
      // The title alone heads the tile's lines; the figure has its own column.
      expect(container.querySelector('.stat-tile__body')?.firstElementChild).toHaveClass(
        'row__title',
      )
    })

    it('gives a run whose fit was refused its estimate and the same lack of status', () => {
      const { container } = renderTile('run', floored)
      expect(container.querySelector('.stat-tile__number')).toHaveTextContent('4:24')
      expect(container.textContent).not.toMatch(STATUS)
    })

    it('asks a ride with no estimate for a 3 min effort, with no status', () => {
      const { container } = renderTile('ride', makeResult({ rideCp: null, rideCpRefusal: 'shape' }))
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
    // Nothing is estimated, so the tile has no chip and its figure's cell is empty, keeping the column.
    expect(container.querySelector('.stat-tile__figure')).toBeEmptyDOMElement()
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
        /^Local · 64% at threshold\.$/,
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
        expect(lines).toEqual([expect.stringMatching(/^Local · 64% at threshold\./)])
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
        // What the figure rests on is the line straight under the title.
        expect(tile.querySelector('.row__title')?.nextElementSibling).toBe(
          tile.querySelector('.stat-tile__source'),
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
        'Recreational · 58% at threshold.',
      )
    })

    it('writes watts a power meter measured the same way: the grade line does not say which they were', () => {
      const result = makeResult({
        activities: [activities[0]!, { ...activities[1]!, powerSource: 'measured' }],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 246, 'ride-1')],
      })
      const { container } = renderTile('ride', result, RIDE_GRADED)
      expect(container.querySelector('.stat-tile__line')?.textContent).toBe(
        'Recreational · 58% at threshold.',
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
