// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { curvePoint } from '../charts/fixtures'
import { makeActivity, makeResult } from '../components/fixtures'
import { SoleSportRecords } from './SoleSportRecords'

afterEach(cleanup)

const RIDE = makeActivity({ id: 'ride-1', name: 'Hill reps', sport: 'ride' })
const RIDE_RESULT = makeResult({
  activities: [RIDE],
  rideCurve: [
    curvePoint(60, 400, 'ride-1'),
    curvePoint(300, 330, 'ride-1'),
    curvePoint(1200, 270, 'ride-1'),
    curvePoint(3600, 230, 'ride-1'),
  ],
})

function renderStrip(result = RIDE_RESULT, sport: 'run' | 'ride' = 'ride', weightKnown = true) {
  return render(
    <SoleSportRecords
      sport={sport}
      result={result}
      massKg={75}
      units="metric"
      profile={null}
      library={result.activities}
      weightKnown={weightKnown}
    />,
  )
}

describe('SoleSportRecords', () => {
  it('shows the lengths the headline does not: the 20 minute best is the level and the threshold’s, so it is left out', () => {
    renderStrip()
    const strip = screen.getByRole('list', { name: 'Best efforts' })
    const labels = within(strip)
      .getAllByRole('listitem')
      .map((tile) => tile.querySelector('.record-tiles__label')?.textContent)
    expect(labels).toEqual(['1 min', '5 min', '60 min'])
  })

  it('names the activity that set the bests, and links on to the sport’s page', () => {
    renderStrip()
    expect(screen.getByText(/Hill reps/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /All your ride best efforts/ })).toHaveAttribute(
      'href',
      '#/ride',
    )
  })

  it('draws nothing where only the headline length is held', () => {
    const only = makeResult({
      activities: [RIDE],
      rideCurve: [curvePoint(1200, 270, 'ride-1')],
    })
    const { container } = renderStrip(only)
    expect(container).toBeEmptyDOMElement()
  })

  it('holds a ride’s figures until the weight is entered, so no W/kg is priced at the placeholder', () => {
    const { container } = renderStrip(RIDE_RESULT, 'ride', false)
    expect(container).toBeEmptyDOMElement()
    expect(container.textContent).not.toMatch(/W\/kg/)
  })
})
