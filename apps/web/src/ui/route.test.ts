import { describe, expect, it } from 'vitest'
import { hrefFor, parseRoute } from './route'
import type { Route } from './route'

describe('parseRoute', () => {
  it.each([
    ['', { page: 'balance' }],
    ['#', { page: 'balance' }],
    ['#/', { page: 'balance' }],
    ['#/run', { page: 'run' }],
    ['#/ride', { page: 'ride' }],
    ['#/activities', { page: 'activities' }],
    ['#/method', { page: 'method' }],
    ['#/profile', { page: 'profile' }],
    ['#/activities/abc', { page: 'activity', id: 'abc' }],
    ['#/activities/a%2Fb%20c', { page: 'activity', id: 'a/b c' }],
    ['#/run/', { page: 'run' }],
    ['#/activities/abc/', { page: 'activity', id: 'abc' }],
  ] as [string, Route][])('reads %s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route)
  })

  it.each(['#/nowhere', '#/run/extra', '#/activities/a/b', '#/profile/x'])(
    'shows Balance for the unknown hash %s',
    (hash) => {
      expect(parseRoute(hash)).toEqual({ page: 'balance' })
    },
  )

  it('falls back to the list when an activity id is not valid percent-encoding', () => {
    expect(parseRoute('#/activities/%E0%A4%A')).toEqual({ page: 'activities' })
  })
})

describe('hrefFor', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { page: 'balance' },
      { page: 'run' },
      { page: 'ride' },
      { page: 'activities' },
      { page: 'method' },
      { page: 'profile' },
      { page: 'activity', id: 'a/b c?#' },
    ]
    for (const route of routes) expect(parseRoute(hrefFor(route))).toEqual(route)
  })

  it('links Balance to the bare hash', () => {
    expect(hrefFor({ page: 'balance' })).toBe('#/')
  })
})
