// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { historyOf } from '@rca/core/history'
import {
  balanceLibrary,
  REFERENCE,
  SETTINGS,
  TWELVE_YEARS,
} from '@rca/core/history/test/balanceLibrary'
import { afterEach, describe, expect, it } from 'vitest'
import '../../test/deviceZone'
import { chartWidth } from '../charts/chartSizeStub'
import { GRADING } from '../balanceFixtures'
import { HistoryPage } from './HistoryPage'

afterEach(cleanup)

/** The twelve synthetic years, with a maximum heart rate for each sport so the intensity part has zones to cut by. */
function everyChart() {
  const history = historyOf(balanceLibrary(TWELVE_YEARS), {
    settings: {
      ...SETTINGS,
      measurements: [
        { kind: 'maxHeartRate', sport: 'run', value: 190, from: '2000-01-01' },
        { kind: 'maxHeartRate', sport: 'ride', value: 185, from: '2000-01-01' },
      ],
    },
    setAside: new Set(),
    nowMs: Date.UTC(2030, 0, 1),
    gate: null,
    effortReference: REFERENCE,
  })
  chartWidth(800)
  const { container } = render(<HistoryPage history={history} units="metric" grading={GRADING} />)
  return [...container.querySelectorAll<HTMLElement>('[data-section]')]
}

describe('HistoryPage with every chart', () => {
  it('draws the seven sections in page order, each with a chart of the library and none empty', () => {
    const sections = everyChart()
    expect(sections.map((section) => section.dataset.section)).toEqual([
      'balance-over-years',
      'training-calendar',
      'hours-per-year',
      'year-to-date',
      'bests-by-year',
      'best-curve-by-year',
      'intensity-by-year',
    ])
    for (const section of sections) {
      expect(within(section).getAllByRole('figure'), section.dataset.section).toHaveLength(1)
      expect(section.querySelector('.chart-frame__empty'), section.dataset.section).toBeNull()
    }
  })

  it.each([
    ['training-calendar', 'All'],
    ['year-to-date', 'Run'],
    ['bests-by-year', 'Run'],
    ['best-curve-by-year', 'Run'],
    ['intensity-by-year', 'Run'],
  ])(
    'keeps the sport toggle of %s in its chart’s controls row, and the toggle through a change',
    (id, first) => {
      const section = everyChart().find((candidate) => candidate.dataset.section === id)!
      const controls = section.querySelector<HTMLElement>('.chart-frame__controls')
      expect(controls, id).not.toBeNull()
      expect(within(controls!).getByRole('radio', { name: first })).toBeChecked()
      const ride = within(controls!).getByRole('radio', { name: 'Ride' })
      fireEvent.click(ride)
      // The same control, not a new one: the chart redraws for the ride around the toggle, so a keyboard user keeps their place.
      expect(ride.isConnected).toBe(true)
      expect(ride).toBeChecked()
      expect(section.querySelector('.chart-frame__controls')).toBe(controls)
    },
  )
})
