// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeActivity } from './fixtures'
import { HeldSportFacts } from './HeldSportFacts'

afterEach(() => {
  cleanup()
})

const NOW = new Date(2026, 9, 28, 12).getTime()

describe('HeldSportFacts', () => {
  it('counts the sport’s activities and their time, and dates the latest, without any weight', () => {
    const activities = [
      makeActivity({
        id: 'r1',
        sport: 'ride',
        startMs: new Date(2026, 9, 3, 7).getTime(),
        durationS: 3600,
      }),
      makeActivity({
        id: 'r2',
        sport: 'ride',
        startMs: new Date(2026, 9, 24, 7).getTime(),
        durationS: 5400,
      }),
      makeActivity({
        id: 'u1',
        sport: 'run',
        startMs: new Date(2026, 9, 26, 7).getTime(),
        durationS: 1800,
      }),
    ]
    render(<HeldSportFacts sport="ride" activities={activities} nowMs={NOW} />)
    expect(screen.getByText('2 rides, 2 h 30 min riding. Latest Sat 24 Oct.')).toBeInTheDocument()
  })

  it('says one activity in the singular, and shows nothing for a sport with none', () => {
    const run = makeActivity({
      id: 'u1',
      sport: 'run',
      startMs: new Date(2026, 9, 26, 7).getTime(),
      durationS: 1800,
    })
    const { container } = render(<HeldSportFacts sport="run" activities={[run]} nowMs={NOW} />)
    expect(container).toHaveTextContent('1 run, 30 min running. Latest Mon 26 Oct.')
    cleanup()
    const empty = render(<HeldSportFacts sport="ride" activities={[run]} nowMs={NOW} />)
    expect(empty.container).toBeEmptyDOMElement()
  })
})

describe('HeldSportFacts: a best the power meter measured', () => {
  const ride = makeActivity({
    id: 'r1',
    sport: 'ride',
    startMs: new Date(2026, 9, 24, 7).getTime(),
    durationS: 3600,
    powerSource: 'measured',
  })
  const best = [{ durationS: 1200, value: 250, activityId: 'r1', startIndex: 0 }]

  it('is given in watts without a weight, since a meter reads them whatever the weight', () => {
    render(<HeldSportFacts sport="ride" activities={[ride]} measured={best} nowMs={NOW} />)
    expect(
      screen.getByText(/Latest Sat 24 Oct\. Best 20 min 250 W from your power meter\./),
    ).toBeInTheDocument()
  })

  it('is left out when no ride was measured, so an estimate is not shown before a weight is known', () => {
    render(<HeldSportFacts sport="ride" activities={[ride]} measured={[]} nowMs={NOW} />)
    expect(screen.queryByText(/power meter/)).not.toBeInTheDocument()
  })

  it('is left out when no curve is given, as for a sport without a meter', () => {
    render(<HeldSportFacts sport="ride" activities={[ride]} nowMs={NOW} />)
    expect(screen.queryByText(/power meter/)).not.toBeInTheDocument()
  })
})
