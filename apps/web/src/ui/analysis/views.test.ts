import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import type { AnalysisController } from './controller'
import * as views from './views'
import type { BalanceView, LandingView, NoticesView, ResultView } from './views'
import { readStylesheet } from '../test/stylesheet'

/** The source of the files under ui/ that the views are checked against. */
const sources = new Map<string, string>()

/** The controller members a source file reads off a prop or argument named `analysis`. */
function readsOf(path: string): string[] {
  const source = sources
    .get(path)!
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const members = new Set<string>()
  for (const match of source.matchAll(/\banalysis\.(\w+)/g)) members.add(match[1]!)
  for (const match of source.matchAll(/const \{([^}]*)\} = analysis(?![.\w])/g))
    for (const part of match[1]!.split(',')) {
      const name = part.split(':')[0]!.trim()
      if (name) members.add(name)
    }
  return [...members]
}

// Each view with the files that take it, a file passing its prop on counted with the file that reads it.
const TAKEN_BY: [keys: readonly string[], files: string[]][] = [
  [views.CHECK_IN_KEYS, ['pages/CheckInLine.tsx']],
  [views.BALANCE_KEYS, ['pages/BalancePage.tsx', 'pages/CheckInLine.tsx']],
  [views.PERIOD_KEYS, ['pages/useResultPeriod.tsx']],
  [
    views.RESULT_KEYS,
    [
      'pages/ResultPage.tsx',
      'pages/BalancePage.tsx',
      'pages/CheckInLine.tsx',
      'pages/useResultPeriod.tsx',
    ],
  ],
  [views.SAVED_LIBRARY_KEYS, ['components/SavedLibraryCard.tsx']],
  [views.PROFILE_KEYS, ['pages/ProfilePage.tsx', 'components/SavedLibraryCard.tsx']],
  [views.LANDING_KEYS, ['pages/LandingPage.tsx']],
  [views.HELD_VIEW_KEYS, ['pages/heldLibraryView.ts']],
  [views.HELD_KEYS, ['pages/HeldLibraryPage.tsx', 'pages/heldLibraryView.ts']],
  [views.LIBRARY_PAGE_KEYS, ['useLibraryPage.ts']],
  [views.LIBRARY_NOTICE_KEYS, ['components/LibraryNotices.tsx']],
  [views.NOTICE_KEYS, ['components/AppNotices.tsx', 'components/LibraryNotices.tsx']],
]

describe('analysis views', () => {
  beforeAll(async () => {
    for (const file of new Set(TAKEN_BY.flatMap(([, files]) => files)))
      sources.set(file, await readStylesheet(import.meta.url, `../${file}`))
  })

  it.each(TAKEN_BY)('lists exactly what its pages read (%j)', (keys, files) => {
    const read = [...new Set(files.flatMap(readsOf))].sort()
    expect([...new Set(keys)].sort()).toEqual(read)
  })

  it('is narrower than the controller for every page', () => {
    expectTypeOf<BalanceView>().not.toHaveProperty('exportData')
    expectTypeOf<LandingView>().not.toHaveProperty('state')
    expectTypeOf<ResultView>().not.toHaveProperty('adoptDevice')
    expectTypeOf<NoticesView>().not.toHaveProperty('addFiles')
    expectTypeOf<AnalysisController>().toMatchTypeOf<ResultView>()
    expect(views.LANDING_KEYS).toEqual(['busy', 'loadSample'])
  })
})
