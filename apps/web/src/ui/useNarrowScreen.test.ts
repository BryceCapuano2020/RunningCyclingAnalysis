import { describe, expect, it } from 'vitest'
import { narrowQuery } from './useNarrowScreen'

describe('narrowQuery', () => {
  it('asks nothing where there is no window, as in a worker, so it is never narrow there', () => {
    expect(narrowQuery(560)).toBeNull()
  })
})
