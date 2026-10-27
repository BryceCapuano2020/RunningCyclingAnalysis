import { describe, expect, it } from 'vitest'
import { isQuietRequest } from './quietRequests'

describe('isQuietRequest', () => {
  it('leaves the age grades’ trend request quiet, as a period pick is, so it never holds the page busy', () => {
    expect(isQuietRequest('setGradeTrend')).toBe(true)
    expect(isQuietRequest('setRange')).toBe(true)
  })

  it('does not make an import quiet, so an import on a deep link is one the page reports', () => {
    expect(isQuietRequest('addFiles')).toBe(false)
  })
})
