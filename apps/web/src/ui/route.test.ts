import { describe, expect, it } from 'vitest'
import { canonicalHash, hashQuery, hrefFor, parseRoute } from './route'
import type { Route } from './route'

describe('parseRoute', () => {
  it.each([
    ['', { page: 'balance' }],
    ['#', { page: 'balance' }],
    ['#/', { page: 'balance' }],
    ['#/run', { page: 'run' }],
    ['#/ride', { page: 'ride' }],
    ['#/history', { page: 'history' }],
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

  it.each(['#/nowhere', '#/run/extra', '#/activities/a/b', '#/profile/x', '#/history/2024'])(
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
      { page: 'history' },
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

describe('canonicalHash', () => {
  it.each(['#/nowhere', '#/run/extra', '#/Run', '#/activities/a/b'])(
    'replaces the unknown hash %s with the balance hash, so the address names the page shown',
    (hash) => {
      expect(canonicalHash(hash)).toBe('#/')
    },
  )

  it.each(['', '#', '#/', '#/run', '#/run/', '#/activities/abc'])(
    'keeps the known hash %s',
    (hash) => {
      expect(canonicalHash(hash)).toBe(hash)
    },
  )
})

describe('a query on a hash route', () => {
  it('is not part of the page, so an Activities list keeps its place in the address', () => {
    expect(parseRoute('#/activities?page=2&sort=distance')).toEqual({ page: 'activities' })
    expect(parseRoute('#/activities/abc?x=1')).toEqual({ page: 'activity', id: 'abc' })
    expect(canonicalHash('#/activities?page=2')).toBe('#/activities?page=2')
  })

  it('reads the query of a hash', () => {
    expect(hashQuery('#/activities?page=2').get('page')).toBe('2')
    expect(hashQuery('#/activities').toString()).toBe('')
  })
})
