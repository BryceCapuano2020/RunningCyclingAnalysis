import { describe, expect, it } from 'vitest'
import { libraryPageOf, pageKeyOf } from './libraryPage'
import type { LibraryPageInputs } from './libraryPage'
import type { Route } from './route'

const ROUTES: Route[] = [
  { page: 'balance' },
  { page: 'run' },
  { page: 'activities' },
  { page: 'activity', id: 'a1' },
  { page: 'method' },
  { page: 'profile' },
]
const base = { restoring: false, failed: false }

function pages(patch: Partial<LibraryPageInputs>) {
  return ROUTES.map((route) =>
    libraryPageOf({ route, hasResult: false, knowledge: 'empty', ...base, ...patch }),
  )
}

describe('libraryPageOf', () => {
  it('shows the landing page only for an empty library; Method and Profile keep their own pages', () => {
    expect(pages({})).toEqual(['landing', 'landing', 'landing', 'landing', 'method', 'profile'])
  })

  it('shows the library page, never the landing page, for a library with no result', () => {
    expect(pages({ knowledge: 'present' })).toEqual([
      'held',
      'held',
      'held',
      'held',
      'method',
      'profile',
    ])
  })

  it('shows the restoring page for a library that has not answered, and an error once it failed', () => {
    expect(pages({ knowledge: 'unknown', restoring: true })).toEqual([
      'restoring',
      'restoring',
      'restoring',
      'restoring',
      'method',
      'profile',
    ])
    expect(pages({ knowledge: 'unknown', failed: true })[0]).toBe('unavailable')
    // A kept library that is restoring is still restoring even if a retry failed.
    expect(pages({ knowledge: 'unknown', failed: true, restoring: true })[0]).toBe('restoring')
  })

  it('keeps the restoring page for a present library until the read that counts it has answered', () => {
    expect(pages({ knowledge: 'present', restoring: true })[0]).toBe('restoring')
    expect(pages({ knowledge: 'present', loading: true })[0]).toBe('restoring')
    expect(pages({ knowledge: 'present', loading: false })[0]).toBe('held')
  })

  it('shows the result pages whenever there is a result', () => {
    expect(pages({ hasResult: true, knowledge: 'present' })).toEqual([
      'result',
      'result',
      'result',
      'result',
      'result',
      'profile',
    ])
  })
})

describe('pageKeyOf', () => {
  it('differs between pages, so focus moves to the new heading', () => {
    const keys = new Set<string>()
    const one = (route: Route, page: Parameters<typeof pageKeyOf>[1]) =>
      keys.add(pageKeyOf(route, page))
    one({ page: 'balance' }, 'landing')
    one({ page: 'balance' }, 'restoring')
    one({ page: 'balance' }, 'held')
    one({ page: 'balance' }, 'unavailable')
    one({ page: 'balance' }, 'result')
    one({ page: 'method' }, 'method')
    one({ page: 'activity', id: 'a1' }, 'result')
    expect(keys.size).toBe(7)
    expect(pageKeyOf({ page: 'activity', id: 'a1' }, 'result')).toBe('activity:a1')
  })
})
