import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, queryFromView, viewFromQuery } from './activitiesView'

const query = (text: string) => new URLSearchParams(text)

describe('viewFromQuery', () => {
  it('starts on the whole library, newest first, on the first page', () => {
    expect(viewFromQuery(query(''))).toEqual(DEFAULT_VIEW)
  })

  it('reads the sport, sort, period and a 1-based page', () => {
    expect(viewFromQuery(query('sport=run&sort=distance&period=42&page=3'))).toEqual({
      sport: 'run',
      sort: 'distance',
      period: 42,
      page: 2,
    })
  })

  it('falls back to the default for any value it does not know', () => {
    expect(viewFromQuery(query('sport=swim&sort=weight&period=soon&page=-4'))).toEqual(DEFAULT_VIEW)
    expect(viewFromQuery(query('page=many'))).toEqual(DEFAULT_VIEW)
  })
})

describe('queryFromView', () => {
  it('writes nothing for the default view', () => {
    expect(queryFromView(DEFAULT_VIEW)).toBe('')
  })

  it('writes only what differs from the default, so the address stays short', () => {
    expect(queryFromView({ ...DEFAULT_VIEW, sort: 'climb', page: 1 })).toBe('sort=climb&page=2')
  })

  it('reads back what it wrote', () => {
    const view = { sport: 'ride' as const, sort: 'oldest' as const, period: 84, page: 4 }
    expect(viewFromQuery(query(queryFromView(view)))).toEqual(view)
  })
})
