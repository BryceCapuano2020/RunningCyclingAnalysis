import { describe, expect, it } from 'vitest'
import { libraryKnowledgeOf } from './libraryKnowledge'
import type { KnowledgeInputs } from './libraryKnowledge'

const nothing: KnowledgeInputs = {
  hasResult: false,
  signedIn: false,
  libraryStatus: 'idle',
  restoring: false,
  saved: 0,
  held: 0,
  unreadable: 0,
  deviceUnreadable: false,
}

describe('libraryKnowledgeOf', () => {
  it('is empty only when everything has answered and nothing is there', () => {
    expect(libraryKnowledgeOf(nothing)).toBe('empty')
    expect(libraryKnowledgeOf({ ...nothing, signedIn: true, libraryStatus: 'loaded' })).toBe(
      'empty',
    )
  })

  it.each([
    ['a result', { hasResult: true }],
    ['a saved activity', { saved: 1 }],
    ['a digest held out of the analysis', { held: 1 }],
    ['rows that could not be read', { unreadable: 3 }],
  ])('is present with %s, even before a signed-in library says it has loaded', (_, patch) => {
    expect(libraryKnowledgeOf({ ...nothing, ...patch })).toBe('present')
    expect(
      libraryKnowledgeOf({ ...nothing, ...patch, signedIn: true, libraryStatus: 'loading' }),
    ).toBe('present')
  })

  it('is unknown while a kept library restores or a signed-in library has not loaded', () => {
    expect(libraryKnowledgeOf({ ...nothing, restoring: true })).toBe('unknown')
    for (const libraryStatus of ['idle', 'loading', 'failed'] as const) {
      expect(libraryKnowledgeOf({ ...nothing, signedIn: true, libraryStatus })).toBe('unknown')
    }
  })

  it('is unknown when this browser’s library could not be read', () => {
    expect(libraryKnowledgeOf({ ...nothing, deviceUnreadable: true })).toBe('unknown')
  })
})
