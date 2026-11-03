import { describe, expect, it, vi } from 'vitest'
import { athlete, hardRunsFrom, NEWEST_MS } from './answer/test/windowLibraries'
import { combine } from './digest/combine'
import { splitPeriods } from './period'
import { AnalysisSession } from './session'
import type { ActivityDigest, AthleteSettings } from './types'

// The analyses the session makes, by how many digests each was given.
vi.mock('./digest/combine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest/combine')>()
  return { ...actual, combine: vi.fn(actual.combine) }
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const SPAN = 425

/** The digests in each of the default's windows, which differ in size, so an analysis can be told by what it was given. */
function sizes(library: ActivityDigest[]): Record<'weeks12' | 'weeks26' | 'months12', number> {
  const count = (days: number) => splitPeriods(library, days).selected.length
  return { weeks12: count(84), weeks26: count(182), months12: count(365) }
}

function analysed(): number[] {
  return vi.mocked(combine).mock.calls.map(([digests]) => digests.length)
}

function session(): AnalysisSession {
  const made = new AnalysisSession()
  made.clock = () => NEWEST_MS
  return made
}

describe('the default period and the period cache', () => {
  it('analyses 12 weeks once, and no other window, when a hard effort is in them', () => {
    const library = athlete({ spanDays: SPAN, hardRuns: hardRunsFrom(10, 8) })
    const { weeks12, weeks26, months12 } = sizes(library)
    expect(new Set([weeks12, weeks26, months12]).size).toBe(3)
    vi.mocked(combine).mockClear()
    session().loadDigests(library, SETTINGS)
    const sizesAnalysed = analysed()
    expect(sizesAnalysed.filter((n) => n === weeks12)).toHaveLength(1)
    expect(sizesAnalysed).not.toContain(weeks26)
    expect(sizesAnalysed).not.toContain(months12)
  })

  it('analyses each window it passes over once, and the window it settles on is not analysed again', () => {
    const library = athlete({ spanDays: SPAN, hardRuns: hardRunsFrom(240, 8) })
    const { weeks12, weeks26, months12 } = sizes(library)
    vi.mocked(combine).mockClear()
    const made = session()
    made.loadDigests(library, SETTINGS)
    for (const n of [weeks12, weeks26, months12]) {
      expect(analysed().filter((size) => size === n)).toHaveLength(1)
    }
    // Asking for the default again, or for the window it settled on, costs no analysis.
    const before = analysed().length
    made.setRange('default', SETTINGS)
    made.setRange(365, SETTINGS)
    expect(analysed()).toHaveLength(before)
  })

  it('is read from the cache by a later state on the same digests', () => {
    const library = athlete({ spanDays: SPAN, hardRuns: hardRunsFrom(240, 8) })
    const made = session()
    made.loadDigests(library, SETTINGS)
    vi.mocked(combine).mockClear()
    made.setSettings(SETTINGS)
    expect(analysed()).toEqual([])
  })
})
