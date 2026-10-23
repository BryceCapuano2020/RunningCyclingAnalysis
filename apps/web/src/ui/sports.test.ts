import { describe, expect, it } from 'vitest'
import { SPORT_LABEL, SPORT_NOUN, SPORT_TITLE } from './sports'

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
