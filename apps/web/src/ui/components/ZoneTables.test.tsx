// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeResult } from './fixtures'
import { ZoneTables } from './ZoneTables'

afterEach(() => {
  cleanup()
})

function renderZones() {
  return render(
    <ZoneTables
      athlete={{ massKg: 70, bikeMassKg: 9 }}
      estimates={makeResult({ runMaxHeartRate: 190, rideMaxHeartRate: 180 })}
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
        name: /^Run heart rate zones From your rides: max heart rate 190 bpm/,
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
