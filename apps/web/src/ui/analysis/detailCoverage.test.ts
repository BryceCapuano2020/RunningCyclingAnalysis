import { describe, expect, it } from 'vitest'
import { detailCoverageLine, judgedDetail } from './detailCoverage'

const held = { ids: new Set(['a', 'b']), oldestStartMs: Date.UTC(2025, 2, 1) }

describe('judgedDetail', () => {
  it('judges this browser’s own library by what it holds', () => {
    expect(judgedDetail(held, { isSample: false, signedIn: false })).toBe(held)
    expect(judgedDetail(null, { isSample: false, signedIn: false })).toBeNull()
  })

  it('judges a signed-in library by nothing, since older detail is read back from a saved original', () => {
    expect(judgedDetail(held, { isSample: false, signedIn: true })).toBeNull()
  })

  it('judges the sample by nothing, so a library stored before it never tags the sample’s rows or notes', () => {
    expect(judgedDetail(held, { isSample: true, signedIn: false })).toBeNull()
    expect(
      detailCoverageLine(judgedDetail(held, { isSample: true, signedIn: false }), 90),
    ).toBeNull()
    expect(detailCoverageLine(held, 90)).not.toBeNull()
  })
})
