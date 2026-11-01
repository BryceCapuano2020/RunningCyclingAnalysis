// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { measureTime } from '../test/zoneTimeFixtures'
import { TimeInZonesSection } from './TimeInZonesSection'

afterEach(cleanup)

const hr = measureTime('run', 'heartRate', [3600, 21_600, 7200, 3600, 0], { entered: 8 })
const pace = measureTime('run', 'pace', [1800, 7200, 3600, 1800, 0], { counted: 5, noData: 3 })

describe('TimeInZonesSection', () => {
  it('names the section and gives a bar for each measure and the table behind a disclosure, with no sentence over them', () => {
    render(
      <TimeInZonesSection sport="run" rows={[hr, pace]} previous={null} previousLabel={null} />,
    )
    const section = screen.getByRole('region', { name: 'Time in zones' })
    expect(section).toHaveAttribute('data-sport', 'run')
    expect(within(section).queryByText(/was easy|took \d+% of your/)).toBeNull()
    const bars = within(section).getByRole('img')
    expect(bars).toHaveAccessibleName(/Heart rate: zone 1 10%, zone 2 60%/)
    expect(bars).toHaveAccessibleName(/Pace: zone 1 13%/)
    expect(within(section).getByText('View as table')).toBeInTheDocument()
  })

  it('has every zone of every measure in the table, and the totals above it', () => {
    render(
      <TimeInZonesSection sport="run" rows={[hr, pace]} previous={null} previousLabel={null} />,
    )
    const tables = screen.getAllByRole('table', { hidden: true })
    expect(tables).toHaveLength(2)
    const [totals, zones] = tables
    expect(within(totals!).getAllByRole('row', { hidden: true })).toHaveLength(3)
    expect(within(zones!).getAllByRole('row', { hidden: true })).toHaveLength(11)
    expect(within(zones!).getByRole('cell', { name: 'Light', hidden: true })).toBeInTheDocument()
  })

  it('says how many activities each measure left out, and where the zones came from', () => {
    render(
      <TimeInZonesSection sport="run" rows={[hr, pace]} previous={null} previousLabel={null} />,
    )
    expect(screen.getByText('3 of 8 runs had no pace to count.')).toBeInTheDocument()
    expect(screen.getByText(/where you have them/)).toBeInTheDocument()
  })

  it('leaves out a measure with too little time, and does not restate the change in a sentence', () => {
    const thin = measureTime('run', 'pace', [60, 0, 0, 0, 0], { counted: 1 })
    const before = measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0], { entered: 8 })
    render(
      <TimeInZonesSection
        sport="run"
        rows={[hr, thin]}
        previous={[before]}
        previousLabel="Previous 6 weeks"
      />,
    )
    expect(screen.getByRole('img')).not.toHaveAccessibleName(/Pace/)
    expect(screen.queryByText(/in the previous 6 weeks/)).toBeNull()
  })

  it('draws nothing when no measure has enough time', () => {
    const thin = measureTime('run', 'pace', [60, 0, 0, 0, 0], { counted: 1 })
    const { container } = render(
      <TimeInZonesSection sport="run" rows={[thin]} previous={null} previousLabel={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('draws a bar for a ride in the ride colour and names measured power', () => {
    const power = measureTime('ride', 'power', [3600, 3600, 3600, 3600, 3600, 3600, 3600])
    render(<TimeInZonesSection sport="ride" rows={[power]} previous={null} previousLabel={null} />)
    expect(screen.getByRole('region', { name: 'Time in zones' })).toHaveAttribute(
      'data-sport',
      'ride',
    )
    expect(screen.getByRole('img')).toHaveAccessibleName(/Measured power: zone 1 14%/)
  })

  it('adds the previous period to the table, and says when the zones changed instead of comparing', () => {
    const rows = [{ ...hr, enteredReferences: [190] }]
    const same = {
      ...measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0], { entered: 8 }),
      enteredReferences: [190],
    }
    const { unmount } = render(
      <TimeInZonesSection
        sport="run"
        rows={rows}
        previous={[same]}
        previousLabel="Previous 6 weeks"
      />,
    )
    expect(
      screen.getByRole('columnheader', { name: 'Previous 6 weeks', hidden: true }),
    ).toBeInTheDocument()
    unmount()
    const moved = { ...same, enteredReferences: [200] }
    render(
      <TimeInZonesSection
        sport="run"
        rows={rows}
        previous={[moved]}
        previousLabel="Previous 6 weeks"
      />,
    )
    expect(
      screen.getByText(
        'Heart rate zones changed since the previous period, so the two are not compared.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: 'Previous 6 weeks', hidden: true }),
    ).toBeNull()
  })

  it('says a heart rate was set aside, apart from one that was not recorded', () => {
    const row = { ...hr, setAside: 2, noData: 1 }
    render(<TimeInZonesSection sport="run" rows={[row]} previous={null} previousLabel={null} />)
    expect(screen.getByText('2 of 11 runs had heart rate set aside.')).toBeInTheDocument()
    expect(screen.getByText('1 of 11 runs had no heart rate to count.')).toBeInTheDocument()
  })

  it('says which stretch the bars are of when the period held too little, and compares with nothing', () => {
    const { unmount } = render(
      <TimeInZonesSection
        sport="run"
        rows={[hr]}
        previous={null}
        previousLabel={null}
        zoneWindow="year"
      />,
    )
    expect(screen.getByText('Last 12 months.')).toBeInTheDocument()
    unmount()
    render(
      <TimeInZonesSection
        sport="run"
        rows={[hr]}
        previous={null}
        previousLabel={null}
        zoneWindow="all"
        relaxed
      />,
    )
    expect(screen.getByText('All time.')).toBeInTheDocument()
    expect(screen.queryByText('Last 12 months.')).toBeNull()
  })

  it('says nothing of a stretch for the period itself', () => {
    render(<TimeInZonesSection sport="run" rows={[hr]} previous={null} previousLabel={null} />)
    expect(screen.queryByText(/Last 12 months|All time/)).toBeNull()
  })

  it('draws whatever all time holds when it is under 3 activities and an hour', () => {
    const little = measureTime('run', 'heartRate', [600, 600, 0, 0, 0], { counted: 1 })
    const { container, unmount } = render(
      <TimeInZonesSection sport="run" rows={[little]} previous={null} previousLabel={null} />,
    )
    expect(container).toBeEmptyDOMElement()
    unmount()
    render(
      <TimeInZonesSection
        sport="run"
        rows={[little]}
        previous={null}
        previousLabel={null}
        zoneWindow="all"
        relaxed
      />,
    )
    expect(screen.getByRole('img')).toHaveAccessibleName(/Heart rate: zone 1 50%/)
  })

  it('says heart rate zones were cut from the highest on file, and pace from the best 30 min, dated', () => {
    const highest = { ...hr, entered: 0, fromHighest: true as const }
    const floored = {
      ...pace,
      floor: { durationS: 1800, asOfMs: new Date(2025, 9, 3, 12).getTime(), activities: 5 },
    }
    render(
      <TimeInZonesSection
        sport="run"
        rows={[highest, floored]}
        previous={null}
        previousLabel={null}
      />,
    )
    expect(
      screen.getByText('Heart rate zones are cut from your highest heart rate on file.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Pace zones are cut from your best 30 min pace, 3 Oct 2025.'),
    ).toBeInTheDocument()
  })
})
