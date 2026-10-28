import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './components/fixtures'
import { curvePoint } from './charts/fixtures'
import { unevenNote } from './unevenNote'

const uneven = {
  fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
  leftOutS: [900, 1200],
  floor: 3.2,
}

const RUN_NOTE =
  'Your best 15 min and 20 min were uneven: each held a hard burst inside easier running, so the range stays wide. A steady all-out 20 min would narrow it.'
const RIDE_NOTE =
  'Your best 15 min and 20 min were uneven: each held a hard burst inside easier riding, so the range stays wide. A steady all-out 20 min would narrow it.'

describe('unevenNote', () => {
  it('is null without an uneven fit for the sport', () => {
    expect(unevenNote(makeResult(), 'run')).toBeNull()
    expect(unevenNote(makeResult(), 'ride')).toBeNull()
  })

  it('names the durations that were left out, and says running for a run', () => {
    expect(unevenNote(makeResult({ runCpUneven: uneven }), 'run')).toBe(RUN_NOTE)
  })

  it('says riding for a ride, and names no estimate while its watts are measured', () => {
    const activities = [makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'measured' })]
    const result = makeResult({
      activities,
      rideCurve: [curvePoint(1200, 3.0, 'ride-1')],
      rideCpUneven: uneven,
    })
    expect(unevenNote(result, 'ride')).toBe(RIDE_NOTE)
  })

  it('adds that the top end uses estimated watts when the ride fit draws on them', () => {
    const activities = [makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' })]
    const result = makeResult({
      activities,
      rideCurve: [curvePoint(1200, 3.0, 'ride-1')],
      rideCpUneven: uneven,
    })
    expect(unevenNote(result, 'ride')).toBe(`${RIDE_NOTE} The top end uses estimated watts.`)
  })
})
