// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeActivity, makeResult, makeRunThreshold } from './components/fixtures'
import { gate, NO_HEART_RATE, THIN, UNKNOWN } from './effortGateFixtures'
import { ThresholdPanel } from './pages/ThresholdPanel'
import { ThresholdTile } from './pages/ThresholdTile'
import { rowValue } from './test/propertyRows'
import { hasThreshold, paceFigure, threshold } from './records'

afterEach(cleanup)

/** The pace of the run estimate these tests give, 16 W/kg gross metabolic: the number the cards print. */
const ESTIMATE_PACE = paceFigure(16, 'metric').number

/** A run whose best was not hard: the estimate stands, and no best stands in for it. */
const notHard = () =>
  makeResult({
    activities: [makeActivity({ id: 'run-1', sport: 'run' })],
    runThreshold: makeRunThreshold(16),
    runMaxHeartRate: 186,
    effortGate: { run: gate(), ride: UNKNOWN },
  })

describe('a run threshold whatever the effort gate says', () => {
  it('reads the estimate for zones and predictions even where the best was not hard', () => {
    expect(hasThreshold(notHard(), 'run')).toBe(true)
    expect(threshold(notHard(), 'run', 70, 'metric')?.number).toBe(ESTIMATE_PACE)
  })

  it('is drawn on the sport page’s panel as the estimate, with no floor, reason, spread or best-named heading', () => {
    const { container } = render(
      <ThresholdPanel sport="run" result={notHard()} massKg={70} units="metric" />,
    )
    expect(screen.getByRole('heading', { name: 'Threshold pace' })).toBeInTheDocument()
    expect(container.querySelector('.sport-hero__number')).toHaveTextContent(ESTIMATE_PACE)
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).not.toMatch(
      /At least|Recorded|Estimated|From your best|90%|reference heart rate|would give a threshold/,
    )
  })

  it('is drawn on the tile under its own title, with the basis said once', () => {
    const { container } = render(
      <ThresholdTile
        sport="run"
        result={notHard()}
        units="metric"
        massKg={70}
        grade={null}
        weighted
      />,
    )
    expect(screen.getByRole('article', { name: 'Run threshold' })).toBeInTheDocument()
    expect(container.querySelector('.stat-tile__number')).toHaveTextContent(ESTIMATE_PACE)
    expect(container.querySelector('.stat-tile__effort')).toBeNull()
    expect(container.textContent?.match(/Runs used/g)).toHaveLength(1)
    expect(rowValue(container, 'Runs used')).toBe('3')
    expect(container.textContent).not.toMatch(
      /At least|From your best|90%|reference heart rate|would give a threshold/,
    )
  })

  it('asks for no heart rate under the threshold, on the panel or the tile', () => {
    for (const unchecked of [NO_HEART_RATE, THIN]) {
      const result = makeResult({
        runThreshold: makeRunThreshold(16),
        effortGate: { run: unchecked, ride: UNKNOWN },
      })
      const panel = render(
        <ThresholdPanel sport="run" result={result} massKg={70} units="metric" />,
      )
      expect(panel.container.querySelector('.sport-hero__number')).toHaveTextContent(ESTIMATE_PACE)
      expect(panel.container.textContent).not.toMatch(/not checked|with heart rate to check/)
      cleanup()
      const tile = render(
        <ThresholdTile
          sport="run"
          result={result}
          units="metric"
          massKg={70}
          grade={null}
          weighted
        />,
      )
      expect(tile.container.querySelector('.stat-tile__number')).toHaveTextContent(ESTIMATE_PACE)
      expect(tile.container.textContent).not.toMatch(/not checked|with heart rate to check/)
      cleanup()
    }
  })
})
