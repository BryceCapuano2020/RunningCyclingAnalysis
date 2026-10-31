// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { analysisStub } from '../test/analysisStub'
import type { ImportManifest } from './importManifest'
import { useLibraryPage } from './useLibraryPage'

function manifest(over: Partial<ImportManifest> = {}): ImportManifest {
  return {
    id: 'a',
    scope: 'device',
    startedAt: 1,
    updatedAt: 1,
    sources: [],
    expected: 100,
    read: 40,
    damaged: [],
    state: 'interrupted',
    ...over,
  }
}

const page = (incompleteImport: ImportManifest | null) =>
  renderHook(() => useLibraryPage(analysisStub({ incompleteImport }), { page: 'balance' }, false))
    .result.current

describe('the hold while the library is only part of what was added', () => {
  it('holds nothing when every import finished', () => {
    expect(page(null).holdInputs.partialImport).toBeUndefined()
  })

  it('feeds the one hold mechanism for an import that stopped, with what lifts it', () => {
    const { holdInputs } = page(manifest())
    expect(holdInputs.partialImport).toEqual({
      text: 'The last import stopped before it finished, so the comparison of your running and cycling waits.',
      action: 'Add the same files again to finish, or choose Use what I have.',
    })
  })

  it('says a damaged zip is why, and to download it again', () => {
    const { holdInputs } = page(
      manifest({ state: 'partial-source', damaged: [{ name: 'export.zip', lost: 3 }] }),
    )
    expect(holdInputs.partialImport?.text).toMatch(/damaged/)
    expect(holdInputs.partialImport?.action).toMatch(/Download the export again/)
  })

  it('gives the same hold object while the same import stands, so surfaces do not redraw', () => {
    const analysis = analysisStub({ incompleteImport: manifest() })
    const route = { page: 'balance' as const }
    const { result, rerender } = renderHook(() => useLibraryPage(analysis, route, false))
    const first = result.current.holdInputs
    rerender()
    expect(result.current.holdInputs).toBe(first)
  })
})
