// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { curvePoint } from '../charts/fixtures'
import { FIVE_K_IN_20_MIN_WKG, makeActivity, makeResult } from '../components/fixtures'
import type { GradeOutcome } from '../grades'
import { THRESHOLD_MEANING } from '../sports'
import { ThresholdTile } from './ThresholdTile'

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
  it('draws a fit’s standard-error range as a fit spread, lighter than a 90% range, and says so', () => {
    const { container } = renderTile('run', makeResult({ runCp: { ...FIT, cpSe: 0.05 } }))
    const track = container.querySelector('.range-track')
    expect(track).toHaveClass('range-track--spread')
    expect(container.querySelector('.range-track__label')).toHaveTextContent('fit spread')
    expect(container.textContent).not.toMatch(/90% range/)
  })

  it('draws no track, and no NaN, when the fit has no spread: both ends are one number', () => {
    const { container } = renderTile('run', makeResult({ runCp: { ...FIT, cpSe: 0 } }))
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.textContent).not.toMatch(/NaN/)
    expect(container.querySelector('.stat-tile__number')).not.toBeNull()
  })

  it('draws no track where the two ends print the same, even if the fit has a sliver of spread', () => {
    const { container } = renderTile('run', makeResult({ runCp: { ...FIT, cpSe: 1e-9 } }))
    expect(container.querySelector('.range-track')).toBeNull()
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

  it('defines the threshold in place, with its meaning in plain words, for each sport', () => {
    for (const sport of ['run', 'ride'] as const) {
      const { container, unmount } = renderTile(sport, makeResult())
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
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      })
      const { container } = renderTile('run', result, RUN_GRADED)
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        /^Local · 64% on your best 20 min, \d+:\d{2} \/km\.$/,
      )
    })

    it('marks estimated watts on the ride’s grade line, with its range', () => {
      const result = makeResult({
        activities,
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 246, 'ride-1')],
      })
      const { container } = renderTile('ride', result, RIDE_GRADED)
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        'Recreational to Local · 58% (52–63%) on your best 20 min, 246 W, estimated.',
      )
    })

    it('leaves “estimated” off watts a power meter measured', () => {
      const result = makeResult({
        activities: [activities[0]!, { ...activities[1]!, powerSource: 'measured' }],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 246, 'ride-1')],
      })
      const { container } = renderTile('ride', result, RIDE_GRADED)
      expect(container.querySelector('.stat-tile__line')).toHaveTextContent(
        /on your best 20 min, 246 W\.$/,
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
