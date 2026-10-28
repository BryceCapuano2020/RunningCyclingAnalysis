// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { measureTime } from '../test/zoneTimeFixtures'
import { TimeInZonesSection } from './TimeInZonesSection'

afterEach(cleanup)

const hr = measureTime('run', 'heartRate', [3600, 21_600, 7200, 3600, 0], { entered: 8 })
const pace = measureTime('run', 'pace', [1800, 7200, 3600, 1800, 0], { counted: 5, noData: 3 })

describe('TimeInZonesSection', () => {
  it('names the section and gives one lede, a bar for each measure and the table behind a disclosure', () => {
    render(
      <TimeInZonesSection sport="run" rows={[hr, pace]} previous={null} previousLabel={null} />,
    )
    const section = screen.getByRole('region', { name: 'Time in zones' })
    expect(section).toHaveAttribute('data-sport', 'run')
    expect(within(section).getAllByText(/was easy/)).toHaveLength(1)
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

  it('leaves out a measure with too little time, and says what moved against the period before', () => {
    const thin = measureTime('run', 'pace', [60, 0, 0, 0, 0], { counted: 1 })
    const before = measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0])
    render(
      <TimeInZonesSection
        sport="run"
        rows={[hr, thin]}
        previous={[before]}
        previousLabel="Previous 6 weeks"
      />,
    )
    expect(screen.getByRole('img')).not.toHaveAccessibleName(/Pace/)
    expect(screen.getByText(/in the previous 6 weeks\.$/)).toBeInTheDocument()
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
    const rows = [{ ...hr, references: [190] }]
    const same = {
      ...measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0]),
      references: [190],
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
    const moved = { ...same, references: [200] }
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
})
