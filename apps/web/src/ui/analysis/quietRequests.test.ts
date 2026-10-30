import { describe, expect, it } from 'vitest'
import { isQuietRequest } from './quietRequests'

describe('isQuietRequest', () => {
  it('leaves a period pick quiet, so it never holds the page busy', () => {
    expect(isQuietRequest('setRange')).toBe(true)
  })

  it('does not make an import quiet, so an import on a deep link is one the page reports', () => {
    expect(isQuietRequest('addFiles')).toBe(false)
  })
})
