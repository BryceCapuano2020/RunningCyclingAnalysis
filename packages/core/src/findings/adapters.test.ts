import { describe, expect, it } from 'vitest'
import { SPORT_ADAPTERS } from './adapters'

describe('SPORT_ADAPTERS', () => {
  it('names each sport in the singular and the plural', () => {
    expect(SPORT_ADAPTERS.run).toEqual({ noun: 'run', nounPlural: 'runs' })
    expect(SPORT_ADAPTERS.ride).toEqual({ noun: 'ride', nounPlural: 'rides' })
  })
})
