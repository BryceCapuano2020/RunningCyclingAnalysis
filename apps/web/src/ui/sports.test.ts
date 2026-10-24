import { describe, expect, it } from 'vitest'
import { SPORT_LABEL, SPORT_NOUN, SPORT_ORDER, SPORT_TITLE } from './sports'

describe('SPORT_LABEL', () => {
  it('names each sport the way an athlete says it', () => {
    expect(SPORT_LABEL).toEqual({ run: 'Run', ride: 'Ride' })
  })
})

describe('SPORT_TITLE and SPORT_NOUN', () => {
  it('titles each sport in chart legends and headings, and uses it as a noun in sentences', () => {
    expect(SPORT_TITLE).toEqual({ run: 'Running', ride: 'Cycling' })
    expect(SPORT_NOUN).toEqual({ run: 'running', ride: 'cycling' })
  })
})

describe('SPORT_ORDER', () => {
  it('lists every sport once, so each sport has one place on the balance meter and the cards', () => {
    expect([...SPORT_ORDER].sort()).toEqual(Object.keys(SPORT_LABEL).sort())
  })

  it('has two sports, one at each end of the balance meter', () => {
    expect(SPORT_ORDER).toHaveLength(2)
  })

  it('puts running first, so it is on the left of the cards and the meter', () => {
    expect(SPORT_ORDER[0]).toBe('run')
  })
})
