// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DigestSplit, DigestSplits } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SplitsTable, type SplitsLoad } from './SplitsTable'

afterEach(() => {
  cleanup()
})

/** A kilometre split that took 300 s, with a flat pace of 290 s and 12 m of climb. */
function split(overrides: Partial<DigestSplit> = {}): DigestSplit {
  return {
    distanceM: 1000,
    seconds: 300,
    gradeAdjustedSeconds: 290,
    elevationGainM: 12,
    avgHeartRate: 150,
    ...overrides,
  }
}

function loaded(splits: DigestSplits | null): SplitsLoad {
  return { status: 'loaded', splits }
}

function renderSplits(load: SplitsLoad, units: UnitSystem = 'metric', distanceM = 50) {
  return render(<SplitsTable load={load} units={units} distanceM={distanceM} />)
}

/** The table, which is the wide representation. */
function table(name = 'Pace for each kilometre'): HTMLElement {
  return screen.getByRole('table', { name })
}

/** The rows of the table, without its header row. */
function bodyRows(name?: string): HTMLElement[] {
  return within(table(name)).getAllByRole('row').slice(1)
}

/** The column headers of the table, in order. */
function columnHeaders(): (string | null)[] {
  return within(table())
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent)
}

/** The list items of the narrow representation. */
function listItems(name = 'Pace for each kilometre'): HTMLElement[] {
  return within(screen.getByRole('list', { name })).getAllByRole('listitem')
}

describe('SplitsTable', () => {
  it('says in words what a flat pace is, once under the splits', () => {
    renderSplits(loaded({ km: [split()], mile: [] }))
    expect(
      screen.getByText('Flat pace: your pace allowing for hills, as if on level ground.'),
    ).toBeInTheDocument()
  })

  it('lists each kilometre split with its pace, flat pace, elevation and heart rate', () => {
    renderSplits(
      loaded({ km: [split(), split({ seconds: 285, gradeAdjustedSeconds: 280 })], mile: [] }),
    )
    const headers = within(table())
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
    expect(headers).toEqual(['Split', 'Pace', 'Flat pace', 'Elevation gain', 'Heart rate'])

    const [first, second] = bodyRows()
    expect(within(first!).getByRole('rowheader', { name: '1' })).toBeInTheDocument()
    expect(within(first!).getByText('5:00 /km')).toBeInTheDocument()
    expect(within(first!).getByText('4:50 /km')).toBeInTheDocument()
    expect(within(first!).getByText('12 m')).toBeInTheDocument()
    expect(within(first!).getByText('150 bpm')).toBeInTheDocument()
    expect(within(second!).getByRole('rowheader', { name: '2' })).toBeInTheDocument()
    expect(within(second!).getByText('4:45 /km')).toBeInTheDocument()
  })

  it('leaves out the elevation gain column when no split climbs, in the table and the list', () => {
    renderSplits(
      loaded({
        km: [split({ elevationGainM: 0 }), split({ elevationGainM: null, seconds: 285 })],
        mile: [],
      }),
    )
    expect(columnHeaders()).toEqual(['Split', 'Pace', 'Flat pace', 'Heart rate'])
    expect(screen.queryByText('Elevation gain', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('leaves out the flat pace column when it equals the pace in every split, in the table and the list', () => {
    renderSplits(
      loaded({
        km: [
          split({ gradeAdjustedSeconds: 300 }),
          split({ seconds: 285, gradeAdjustedSeconds: 285 }),
        ],
        mile: [],
      }),
    )
    expect(columnHeaders()).toEqual(['Split', 'Pace', 'Elevation gain', 'Heart rate'])
    expect(screen.queryByText('Flat pace', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('keeps the flat pace column while one split differs from its pace', () => {
    renderSplits(
      loaded({
        km: [
          split({ gradeAdjustedSeconds: 300 }),
          split({ seconds: 285, gradeAdjustedSeconds: 280 }),
        ],
        mile: [],
      }),
    )
    expect(columnHeaders()).toContain('Flat pace')
  })

  it('uses mile splits in imperial, names the table after them, and shows feet', () => {
    renderSplits(
      loaded({
        km: [split()],
        mile: [split({ distanceM: 1609.344, seconds: 480, gradeAdjustedSeconds: 470 })],
      }),
      'imperial',
    )
    expect(within(bodyRows('Pace for each mile')[0]!).getByText('8:00 /mi')).toBeInTheDocument()
    // 12 m is 39 ft.
    expect(within(bodyRows('Pace for each mile')[0]!).getByText('39 ft')).toBeInTheDocument()
  })

  it('labels the partial split with its own distance and paces it over that distance', () => {
    renderSplits(
      loaded({
        km: [split(), split(), split({ distanceM: 420, seconds: 135, gradeAdjustedSeconds: 130 })],
        mile: [],
      }),
    )
    const rows = bodyRows()
    expect(within(rows[2]!).getByRole('rowheader', { name: '0.4 km' })).toBeInTheDocument()
    expect(within(rows[2]!).getByText('5:21 /km')).toBeInTheDocument()
  })

  it('shows an unknown time as a dash that says the pace is not measured, and leaves it out of the fastest', () => {
    renderSplits(
      loaded({
        km: [
          split({ distanceM: 1000, seconds: null, gradeAdjustedSeconds: null }),
          split({ seconds: 300, gradeAdjustedSeconds: 290 }),
        ],
        mile: [],
      }),
    )
    const [unknown, known] = bodyRows()
    expect(within(unknown!).getByRole('cell', { name: 'Not measured' })).toBeInTheDocument()
    expect(within(unknown!).queryByText('Fastest')).not.toBeInTheDocument()
    expect(within(known!).getByText('Fastest')).toBeInTheDocument()
  })

  it('keeps elevation when the flat pace is unknown, and says so when there is no altitude', () => {
    renderSplits(
      loaded({
        km: [
          split({ gradeAdjustedSeconds: null, elevationGainM: 12 }),
          split({ elevationGainM: null, gradeAdjustedSeconds: null }),
        ],
        mile: [],
      }),
    )
    const [withClimb, noAltitude] = bodyRows()
    expect(within(withClimb!).getByText('12 m')).toBeInTheDocument()
    expect(within(withClimb!).getAllByRole('cell', { name: 'Not available' })).toHaveLength(1)
    expect(within(noAltitude!).getByRole('cell', { name: 'No altitude' })).toBeInTheDocument()
    expect(within(noAltitude!).getByRole('cell', { name: 'Not available' })).toBeInTheDocument()
  })

  it('shows a missing heart rate as a dash with words for a screen reader', () => {
    renderSplits(loaded({ km: [split({ avgHeartRate: null })], mile: [] }))
    expect(within(bodyRows()[0]!).getByRole('cell', { name: 'No heart rate' })).toBeInTheDocument()
    expect(
      within(bodyRows()[0]!).getByText('–', { selector: '[aria-hidden="true"]' }),
    ).toBeVisible()
  })

  it('marks the fastest known split with a visible Fastest chip and bold pace', () => {
    renderSplits(
      loaded({ km: [split(), split({ seconds: 285, gradeAdjustedSeconds: 280 })], mile: [] }),
    )
    const [first, second] = bodyRows()
    const chip = within(second!).getByText('Fastest')
    expect(chip).toHaveClass('chip')
    expect(within(second!).getByText('4:45 /km')).toHaveClass('splits-table__fastest')
    expect(within(first!).queryByText('Fastest')).not.toBeInTheDocument()
  })

  it('marks only the first of two splits at the same fastest pace', () => {
    renderSplits(
      loaded({
        km: [split({ seconds: 285, gradeAdjustedSeconds: 280 }), split({ seconds: 285 })],
        mile: [],
      }),
    )
    const [first, second] = bodyRows()
    expect(within(first!).getByText('Fastest')).toBeInTheDocument()
    expect(within(second!).queryByText('Fastest')).not.toBeInTheDocument()
  })

  it('draws each bar from zero, its length the pace relative to the fastest known split, hidden from assistive technology', () => {
    const { container } = renderSplits(
      loaded({
        // The second split is faster, so it fills the track; the first runs at 285/300 of its pace.
        km: [split(), split({ seconds: 285, gradeAdjustedSeconds: 280 })],
        mile: [],
      }),
    )
    const bars = [...container.querySelectorAll<HTMLElement>('.splits-table__bar')].slice(0, 2)
    expect(bars.map((bar) => parseFloat(bar.style.width))).toEqual([
      expect.closeTo(95, 6),
      expect.closeTo(100, 6),
    ])
    for (const track of container.querySelectorAll('.splits-table__track')) {
      expect(track).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('scales the bars to the fastest known split, not to a split with no time', () => {
    const { container } = renderSplits(
      loaded({
        km: [
          split({ seconds: 400, gradeAdjustedSeconds: 380 }),
          split({ seconds: null, gradeAdjustedSeconds: null }),
          split({ seconds: 500, gradeAdjustedSeconds: 480 }),
        ],
        mile: [],
      }),
    )
    const bars = [...container.querySelectorAll<HTMLElement>('.splits-table__bar')].slice(0, 2)
    expect(bars.map((bar) => parseFloat(bar.style.width))).toEqual([
      expect.closeTo(100, 6),
      expect.closeTo(80, 6),
    ])
  })

  it('shows the same splits as a table and as a list, with one definition list per split', () => {
    renderSplits(
      loaded({ km: [split(), split({ seconds: 285, gradeAdjustedSeconds: 280 })], mile: [] }),
    )
    const [first] = listItems()
    expect(screen.getAllByText('Split', { selector: 'dt' })).toHaveLength(2)
    expect(within(first!).getByText('5:00 /km')).toBeInTheDocument()
    expect(within(first!).getByText('4:50 /km')).toBeInTheDocument()
    expect(within(first!).getByText('12 m')).toBeInTheDocument()
    expect(within(first!).getByText('150 bpm')).toBeInTheDocument()
    expect(listItems()).toHaveLength(2)
    expect(within(listItems()[1]!).getByText('Fastest')).toBeInTheDocument()
  })

  it('says a run is too short to split when it has no splits in these units', () => {
    renderSplits(loaded({ km: [], mile: [] }))
    expect(screen.getByText('This run is too short to split.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('leaves the flat-pace note out when there are no split rows, under either empty line', () => {
    const { unmount } = renderSplits(loaded({ km: [], mile: [] }))
    expect(screen.getByText('This run is too short to split.')).toBeInTheDocument()
    expect(
      screen.queryByText('Flat pace: your pace allowing for hills, as if on level ground.'),
    ).not.toBeInTheDocument()
    unmount()
    renderSplits(loaded({ km: [], mile: [] }), 'metric', 500_500)
    expect(screen.getByText('Splits are kept for runs up to 500 km.')).toBeInTheDocument()
    expect(
      screen.queryByText('Flat pace: your pace allowing for hills, as if on level ground.'),
    ).not.toBeInTheDocument()
  })

  it('says a run past the split limit is kept only up to it, which is not the too-short line', () => {
    renderSplits(loaded({ km: [], mile: [] }), 'metric', 500_500)
    expect(screen.getByText('Splits are kept for runs up to 500 km.')).toBeInTheDocument()
    expect(screen.queryByText('This run is too short to split.')).not.toBeInTheDocument()
  })

  it('states the mile limit in miles for an imperial run past it', () => {
    renderSplits(loaded({ km: [], mile: [] }), 'imperial', 600_000)
    expect(screen.getByText('Splits are kept for runs up to 320 mi.')).toBeInTheDocument()
  })

  it('says splits were not kept when the run was added, and shows no table', () => {
    renderSplits(loaded(null))
    expect(screen.getByRole('heading', { level: 2, name: 'Splits' })).toBeInTheDocument()
    expect(screen.getByText('Splits were not kept when this run was added.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says the splits are loading while they are asked for', () => {
    renderSplits({ status: 'loading' })
    expect(screen.getByText('Loading splits.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says the splits could not be loaded when the worker fails to answer', () => {
    renderSplits({ status: 'failed' })
    expect(
      screen.getByText('The splits could not be loaded. Open this activity again to retry.'),
    ).toBeInTheDocument()
  })
})
