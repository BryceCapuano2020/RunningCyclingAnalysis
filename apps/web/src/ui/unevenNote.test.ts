import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './components/fixtures'
import { curvePoint } from './charts/fixtures'
import { unevenNote } from './unevenNote'

const uneven = {
  fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
  leftOutS: [900, 1200],
  floor: 3.2,
}

const NOTE = 'Best 15 min and 20 min mixed hard and easy.'

describe('unevenNote', () => {
  it('is null without an uneven fit for the sport', () => {
    expect(unevenNote(makeResult(), 'run')).toBeNull()
    expect(unevenNote(makeResult(), 'ride')).toBeNull()
  })

  it('names the durations that were left out, and no more', () => {
    expect(unevenNote(makeResult({ runCpUneven: uneven }), 'run')).toBe(NOTE)
    expect(unevenNote(makeResult({ runCpUneven: { ...uneven, leftOutS: [1200] } }), 'run')).toBe(
      'Best 20 min mixed hard and easy.',
    )
  })

  it('says the same for a ride, and names no estimate while its watts are measured', () => {
    const activities = [makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'measured' })]
    const result = makeResult({
      activities,
      rideCurve: [curvePoint(1200, 3.0, 'ride-1')],
      rideCpUneven: uneven,
    })
    expect(unevenNote(result, 'ride')).toBe(NOTE)
  })

  it('adds that the top end uses estimated watts when the ride fit draws on them', () => {
    const activities = [makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' })]
    const result = makeResult({
      activities,
      rideCurve: [curvePoint(1200, 3.0, 'ride-1')],
      rideCpUneven: uneven,
    })
    expect(unevenNote(result, 'ride')).toBe(`${NOTE} The top end uses estimated watts.`)
  })
})
