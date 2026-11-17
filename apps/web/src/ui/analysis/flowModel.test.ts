import { describe, expect, it } from 'vitest'
import { clientVerdict, type ClientFaults } from './flowModel'

// One tab of a signed-in account: the device copy, the library reads and their coalescing, a delete and its hashchange events,
// a rename, an import whose original may be refused at the limit, and the route guard after every render. Each world action
// (`env`) is the visitor's or another tab's; the system actions are the worker's replies, the browser's events and the server.
const CHANCES = { navigations: 2, imports: 1, renames: 1, deletes: 1, otherTabChanges: 1 }

describe('the signed-in tab keeps its invariants and always settles', () => {
  it.each([
    ['two moves between pages, an import, a rename and a delete', { otherTabChanges: 0 }],
    ['two moves between pages, an import, a rename and another tab', { deletes: 0 }],
  ])('%s', (_, fewer) => {
    expect(clientVerdict({ ...CHANCES, ...fewer })).toMatchObject({ ok: true })
  })

  // The race this model found on main (a read during an import re-armed the guard): the shortest trace is now in
  // useRouteGuard.steps.test.ts, and these bounds reach it.
  it('holds when a library read overlaps an import and the app moves the visitor', () => {
    const overlap = { navigations: 0, imports: 1, renames: 0, deletes: 1, otherTabChanges: 1 }
    expect(clientVerdict(overlap)).toMatchObject({ ok: true })
  })
})

describe('the client model finds each race when its fix is taken out', () => {
  it.each<[string, ClientFaults, string]>([
    [
      '#538 the delete notice cleared by a late hashchange (libraryState.ts keepsLibraryNotice)',
      { noticeKeptOnlyByMark: true },
      'the delete notice stays while the visitor is on the library pages',
    ],
    [
      '#539 a rename refused during a re-read (libraryActions.ts readHoldsLibrary)',
      { quietReadHoldsLibrary: true },
      'no rename or redirect goes wrong',
    ],
    [
      '#545 the refused original wiped by a re-read (core sessionIndex.ts settlesOnListing)',
      { listingSettlesRefusedOriginal: true },
      'a refused original keeps its notice until the server holds the file',
    ],
    [
      '#546 the guard takes a re-read for an import (useRouteGuard.ts libraryLoadHolds)',
      { guardTakesRereadForImport: true },
      'no rename or redirect goes wrong',
    ],
  ])('%s', (_, faults, broken) => {
    expect(clientVerdict(CHANCES, faults)).toMatchObject({ ok: false, broken })
  })
})
