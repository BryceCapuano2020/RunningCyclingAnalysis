import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import type { AthleteSettings } from './types'
import { copiedLibrary } from './test/libraryFixture'

/** What the worker posts: the state is structured-cloned to the page, so its size is what a library costs the page. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const ACTIVITIES = 300
/**
 * An all-time state of 300 activities is about 1.1 KB of JSON for each when an object held twice
 * is counted once, as a structured clone sends it. It was about 1.45 KB while the period's activities
 * and the library list held separate copies of every summary.
 */
const MAX_KB_EACH = 1.25

/** The length of the value as JSON, an object met again written as a reference, as a clone sends it. */
function clonedLength(value: unknown): number {
  const met = new WeakSet<object>()
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return entry
    if (met.has(entry)) return 0
    met.add(entry)
    return entry instanceof Map ? [...entry] : entry
  }).length
}

describe('the state a session posts', () => {
  const session = new AnalysisSession()
  session.choosePeriod('all')
  const state = session.loadDigests(copiedLibrary(ACTIVITIES), SETTINGS)

  it('holds each activity of the period once, shared with the library list', () => {
    const library = new Set(state.library)
    expect(state.result!.activities).toHaveLength(ACTIVITIES)
    expect(state.result!.activities.every((activity) => library.has(activity))).toBe(true)
    // A structured clone keeps the sharing, so the page receives one object for each activity too.
    const clone = structuredClone(state)
    const cloned = new Set(clone.library)
    expect(clone.result!.activities.every((activity) => cloned.has(activity))).toBe(true)
  })

  it(`is under ${MAX_KB_EACH} KB for each activity of an all-time view`, () => {
    const kilobytesEach = clonedLength(state) / 1024 / ACTIVITIES
    expect(kilobytesEach).toBeGreaterThan(0.2)
    expect(kilobytesEach).toBeLessThan(MAX_KB_EACH)
  })
})
