// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ZoneEstimates } from '@rca/core/zones'
import { estimatesFrom, makeResult } from './fixtures'
import { ZoneTables } from './ZoneTables'

afterEach(() => {
  cleanup()
})

function renderZones() {
  return render(
    <ZoneTables
      athlete={{ massKg: 70, bikeMassKg: 9 }}
      estimates={estimatesFrom(makeResult({ runMaxHeartRate: 190, rideMaxHeartRate: 180 }))}
      weightKnown
      units="metric"
    />,
  )
}

describe('ZoneTables', () => {
  it('puts each title above its table as a heading, not in a caption inside it', () => {
    const { container } = renderZones()

    expect(container.querySelector('caption')).toBeNull()
    const heading = screen.getByRole('heading', { level: 3, name: 'Run heart rate zones' })
    const table = screen.getByRole('table', { name: /^Run heart rate zones/ })
    expect(heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(table).not.toContainElement(heading)
  })

  it('names the table by its title and where the reference came from', () => {
    renderZones()
    expect(
      screen.getByRole('table', {
        name: /^Run heart rate zones Max heart rate: 190 bpm, your cycling maximum/,
      }),
    ).toBeTruthy()
  })

  it('gives each zone a row with its number, name and range', () => {
    renderZones()
    const table = screen.getByRole('table', { name: /^Run heart rate zones/ })
    const [first] = within(table).getAllByRole('row').slice(1)
    expect(within(first!).getAllByRole('cell')).toHaveLength(2)
    expect(within(first!).getByRole('rowheader')).toHaveTextContent('1')
  })
})

describe('ZoneTables, the max heart rate and its source', () => {
  const sinceMs = new Date(2021, 8, 15, 12).getTime()
  const withSource = (): ZoneEstimates => ({
    ...estimatesFrom(makeResult({ runMaxHeartRate: 186, rideMaxHeartRate: 180 })),
    runObservedMaxHeartRate: 186,
    rideObservedMaxHeartRate: 172,
    observedMaxSource: { run: { bpm: 186, days: 4, sinceMs }, ride: null },
  })
  const zones = (onSet?: (sport: string, bpm: number) => void) =>
    render(
      <ZoneTables
        athlete={{ massKg: 70, bikeMassKg: 9 }}
        estimates={withSource()}
        weightKnown
        units="metric"
        onSetMaxHeartRate={onSet}
      />,
    )

  it('names where the figure comes from and asks if it is right, with a Set control that says which figure', () => {
    const onSet = vi.fn()
    zones(onSet)
    expect(
      screen.getByText(
        'Max heart rate: 186 bpm, the highest you reached on 4 separate days since Sep 2021.',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/^Is that right\?/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Set it for your run max heart rate' }))
    expect(onSet).toHaveBeenCalledWith('run', 186)
    // The ride's is worked out from the run's, and can be corrected too.
    expect(
      screen.getByText('Max heart rate: 180 bpm, 6 bpm below your running maximum.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set it for your ride max heart rate' }))
    expect(onSet).toHaveBeenLastCalledWith('ride', 180)
  })

  it('names each Set control by words that include its visible text, for speech input', () => {
    zones(vi.fn())
    for (const sport of ['run', 'ride']) {
      const button = screen.getByRole('button', { name: `Set it for your ${sport} max heart rate` })
      expect(button).toHaveTextContent('Set it')
      expect(button.getAttribute('aria-label')!.startsWith(button.textContent!)).toBe(true)
    }
  })

  it('states the source without the question when it cannot be set from here', () => {
    zones()
    expect(
      screen.getByText(/186 bpm, the highest you reached on 4 separate days/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Set your/ })).toBeNull()
    expect(screen.queryByText(/Is that right/)).toBeNull()
  })
})

describe('ZoneTables, a pace or power the fitness cannot give today', () => {
  it('says what would give it, and still shows the heart rate zones', () => {
    const base = estimatesFrom(makeResult({ runMaxHeartRate: 190, rideMaxHeartRate: 180 }))
    // The library holds runs and rides, but the only fit ended long before today.
    const lapsed = (fit: NonNullable<ZoneEstimates['thresholds']['run'][0]>['fit']) => [
      { fromMs: 0, fit, asOfMs: 1000, lastFit: 0 },
      { fromMs: 1, fit: null, asOfMs: null, lastFit: 0 },
    ]
    const estimates: ZoneEstimates = {
      ...base,
      thresholds: {
        run: lapsed(base.thresholds.run[0]!.fit),
        ride: lapsed(base.thresholds.ride[0]!.fit),
      },
    }
    render(
      <ZoneTables
        athlete={{ massKg: 70, bikeMassKg: 9 }}
        estimates={estimates}
        weightKnown
        units="metric"
      />,
    )
    expect(screen.getByRole('table', { name: /^Run heart rate zones/ })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /^Run pace zones/ })).toBeNull()
    expect(
      screen.getByText(
        'No run pace zones today. A hard, even 3–5 min effort and a hard 20 min effort set your pace zones.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/^No ride power zones today\./)).toBeInTheDocument()
  })
})

describe('ZoneTables, a max heart rate that cannot be one', () => {
  const base = (): ZoneEstimates =>
    estimatesFrom(makeResult({ runMaxHeartRate: 205, rideMaxHeartRate: null }))
  const zones = (estimates: ZoneEstimates, onSet?: (sport: string, bpm: number) => void) =>
    render(
      <ZoneTables
        athlete={{ massKg: 70, bikeMassKg: 9 }}
        estimates={estimates}
        weightKnown
        units="metric"
        onSetMaxHeartRate={onSet}
      />,
    )

  it('asks up front, not in small print, when the max is far over what one is at the age', () => {
    const onSet = vi.fn()
    zones({ ...base(), untrustedMax: { run: 'high' } }, onSet)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('well above what a maximum is at your age')
    expect(note).toHaveTextContent('Is that right?')
    expect(screen.getAllByText(/Is that right\?/)).toHaveLength(1)
    fireEvent.click(within(note).getByRole('button', { name: /max heart rate/ }))
    expect(onSet).toHaveBeenCalledWith('run', 205)
    expect(screen.getByRole('table', { name: /^Run heart rate zones/ })).toBeTruthy()
  })

  it('leaves the small offer alone for a max that can be one', () => {
    zones(base(), vi.fn())
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.getByText(/Is that right\?/)).toBeTruthy()
  })

  it('shows no heart rate zones where no effort reached near the max, and says what would give them', () => {
    zones({ ...base(), untrustedMax: { run: 'habitual' } })
    expect(screen.queryByRole('table', { name: /^Run heart rate zones/ })).toBeNull()
    expect(
      screen.getByText(
        /^No run heart rate zones today\. None of your efforts reached near your maximum/,
      ),
    ).toBeTruthy()
  })
})
