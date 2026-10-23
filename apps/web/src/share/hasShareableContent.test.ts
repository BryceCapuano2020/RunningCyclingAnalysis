import { describe, expect, it } from 'vitest'
import { makeResult } from '../ui/components/fixtures'
import { hasShareableContent } from './hasShareableContent'

const NO_COMPARISON = { prior: [], calibrated: null }

describe('hasShareableContent', () => {
  it('is true with a comparison', () => {
    expect(hasShareableContent(makeResult())).toBe(true)
  })

  it('is true with one sport estimate and no comparison', () => {
    expect(hasShareableContent(makeResult({ comparison: NO_COMPARISON, rideCp: null }))).toBe(true)
    expect(hasShareableContent(makeResult({ comparison: NO_COMPARISON, runCp: null }))).toBe(true)
  })

  it('is false with neither a comparison nor any sport estimate', () => {
    expect(
      hasShareableContent(makeResult({ comparison: NO_COMPARISON, runCp: null, rideCp: null })),
    ).toBe(false)
  })
})
