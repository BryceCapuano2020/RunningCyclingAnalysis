import { describe, expect, it } from 'vitest'
import { libraryPageOf } from './libraryPage'
import { PAGE_RULES, SIMPLE_PAGES } from './pageRules'
import type { PageName, PageRule } from './pageRules'
import { hrefFor, parseRoute } from './route'
import type { Route } from './route'
import { needsResult } from './useRouteGuard'

const routeOf = (page: PageName): Route => (page === 'activity' ? { page, id: 'a1' } : { page })

describe('PAGE_RULES', () => {
  it('pins what each page needs, so a page that opens without endurance files is a deliberate change', () => {
    const open: PageRule = { needsResult: false, ownPage: null, ownOverResult: false }
    const needs: PageRule = { needsResult: true, ownPage: null, ownOverResult: false }
    expect(PAGE_RULES).toEqual({
      balance: open,
      run: needs,
      ride: needs,
      history: needs,
      activities: needs,
      activity: needs,
      method: { needsResult: false, ownPage: 'method', ownOverResult: false },
      profile: { needsResult: false, ownPage: 'profile', ownOverResult: true },
    })
  })

  it('has a rule for every page the route can name, and no other', () => {
    expect(Object.keys(PAGE_RULES).sort()).toEqual([...SIMPLE_PAGES, 'activity'].sort())
  })

  it('gives a page of its own no need for a result, and an own page over a result must be one', () => {
    for (const rule of Object.values(PAGE_RULES)) {
      if (rule.ownPage !== null) expect(rule.needsResult).toBe(false)
      if (rule.ownOverResult) expect(rule.ownPage).not.toBeNull()
    }
  })

  it('reads every page from the route and back, so the list of pages is one list', () => {
    for (const page of SIMPLE_PAGES) {
      expect(parseRoute(hrefFor({ page }))).toEqual({ page })
    }
  })

  it('drives needsResult and the page shown with no result, for every page', () => {
    for (const page of Object.keys(PAGE_RULES) as PageName[]) {
      const rule = PAGE_RULES[page]
      const route = routeOf(page)
      const inputs = { route, knowledge: 'empty', restoring: false, failed: false } as const
      expect(needsResult(route)).toBe(rule.needsResult)
      expect(libraryPageOf({ ...inputs, hasResult: false })).toBe(rule.ownPage ?? 'landing')
      expect(libraryPageOf({ ...inputs, hasResult: true })).toBe(
        rule.ownOverResult ? rule.ownPage : 'result',
      )
    }
  })
})
