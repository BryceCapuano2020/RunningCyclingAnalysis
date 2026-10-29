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
