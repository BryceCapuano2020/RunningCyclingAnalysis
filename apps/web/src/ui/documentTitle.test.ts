import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './components/fixtures'
import { documentTitleFor } from './documentTitle'

const APP = 'RunningCyclingAnalysis'
const result = makeResult()

describe('documentTitleFor', () => {
  it.each([
    [{ page: 'balance' }, 'Balance'],
    [{ page: 'run' }, 'Run'],
    [{ page: 'ride' }, 'Ride'],
    [{ page: 'activities' }, 'Activities'],
    [{ page: 'method' }, 'How sure is this?'],
  ] as const)('names the %o page in the tab title', (route, name) => {
    expect(documentTitleFor(route, result)).toBe(`${name} · ${APP}`)
  })

  it('names an activity by its own name, so each one is told apart in history', () => {
    expect(documentTitleFor({ page: 'activity', id: 'run-1' }, result)).toBe(`Morning run · ${APP}`)
  })

  it('falls back to the word Activity for an id that is not in the library', () => {
    expect(documentTitleFor({ page: 'activity', id: 'missing' }, result)).toBe(`Activity · ${APP}`)
  })

  it('names Profile even with no result, since the Profile page shows without one', () => {
    expect(documentTitleFor({ page: 'profile' }, null)).toBe(`Profile · ${APP}`)
  })

  it('names How sure is this? with no result, since that page shows without one', () => {
    expect(documentTitleFor({ page: 'method' }, null)).toBe(
      'How sure is this? · RunningCyclingAnalysis',
    )
  })

  it('is the app name alone on the landing page, which has no page of its own', () => {
    expect(documentTitleFor({ page: 'run' }, null)).toBe(APP)
    expect(documentTitleFor({ page: 'balance' }, null)).toBe(APP)
  })

  it('falls back to the word Activity for a name that is blank, rather than titling the page with nothing', () => {
    const blank = makeResult({ activities: [makeActivity({ id: 'blank', name: '   ' })] })
    expect(documentTitleFor({ page: 'activity', id: 'blank' }, blank)).toBe(`Activity · ${APP}`)
  })
})
