// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { makeResult } from './components/fixtures'
import { NO_HEART_RATE, THIN, UNKNOWN, withheld } from './effortGateFixtures'
import { ThresholdPanel } from './pages/ThresholdPanel'
import { ThresholdTile } from './pages/ThresholdTile'
import { hasThreshold, threshold } from './records'
import { floorBasisLine, floorThreshold } from './thresholdFloor'
import { thresholdUncheckedLine } from './thresholdUnchecked'

afterEach(cleanup)

describe('a threshold the effort gate withheld', () => {
  it('shows the best 30 minutes as a floor in place of the estimate, on the line that names it', () => {
    const floor = floorThreshold(withheld(), 'run', 70, 'metric')
    expect(floor?.value).toMatch(/\/km$/)
    expect(floorBasisLine(withheld(), 'run')).toBe('From your best 30 min.')
    expect(
      floorBasisLine(withheld({ floor: { durationS: HEADLINE_DURATION_S, value: 3.4 } }), 'run'),
    ).toBe('From your best 20 min.')
    expect(floorBasisLine(makeResult(), 'run')).toBeNull()
  })

  it('keeps the threshold itself out of what zones and predictions read', () => {
    expect(threshold(withheld(), 'run', 70, 'metric')).toBeNull()
    expect(hasThreshold(withheld(), 'run')).toBe(false)
  })

  it('is drawn on the sport page’s panel as a floor, with no reason, spread or best-named heading', () => {
    const { container } = render(
      <ThresholdPanel
        sport="run"
        result={withheld()}
        massKg={70}
        units="metric"
        rangeDays={null}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Threshold pace, at least' })).toBeInTheDocument()
    expect(screen.getByText('At least')).toBeInTheDocument()
    expect(screen.getByText('From your best 30 min.')).toBeInTheDocument()
    expect(screen.queryByText('Recorded')).toBeNull()
    expect(screen.queryByText('Estimated')).toBeNull()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).not.toMatch(/90%|reference heart rate|would give a threshold/)
    expect(container.querySelector('.sport-hero__number')).not.toBeNull()
  })

  it('is drawn on the tile under its own title, with the basis said once', () => {
    const { container } = render(
      <ThresholdTile
        sport="run"
        result={withheld()}
        units="metric"
        massKg={70}
        grade={null}
        weighted
      />,
    )
    expect(screen.getByRole('article', { name: 'Run threshold' })).toBeInTheDocument()
    expect(screen.getByText('At least')).toBeInTheDocument()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.querySelector('.stat-tile__effort')).toBeNull()
    expect(container.textContent?.match(/From your best 30 min\./g)).toHaveLength(1)
    expect(container.textContent).not.toMatch(/90%|reference heart rate|would give a threshold/)
  })

  it('says a shown threshold was not checked where there was no heart rate to check it by', () => {
    const noHr = makeResult({ effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } })
    expect(thresholdUncheckedLine(noHr, 'run')).toBe(
      'No heart rate on your best 20 min run, so the effort was not checked. Add a run with heart rate to check it.',
    )
    const thin = makeResult({ effortGate: { run: THIN, ride: UNKNOWN } })
    expect(thresholdUncheckedLine(thin, 'run')).toContain('Too few days with heart rate')
    expect(thresholdUncheckedLine(makeResult(), 'run')).toBeNull()
  })

  it('says a shown threshold was not checked on the panel, and leaves the tile to the balance’s one note', () => {
    const result = makeResult({ effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } })
    const panel = render(
      <ThresholdPanel sport="run" result={result} massKg={70} units="metric" rangeDays={null} />,
    )
    expect(panel.container.textContent).toContain('No heart rate on your best 20 min run')
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
    expect(tile.container.textContent).not.toMatch(/not checked/)
    expect(tile.container.querySelector('.stat-tile__number')).not.toBeNull()
  })
})
