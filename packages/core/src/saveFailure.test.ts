import { describe, expect, it } from 'vitest'
import { isTransient, stopsSaving } from './saveFailure'
import type { SyncIssueCode } from './saveFailure'

describe('which failures sending again can clear', () => {
  it('is the connection and a server error, and nothing a limit or a refusal says', () => {
    const codes: SyncIssueCode[] = ['network', 'server', 'original-held']
    const others: SyncIssueCode[] = [
      'signed-out',
      'storage-quota',
      'storage-budget',
      'rate-limited',
      'original-unsent',
      'file-too-large',
      'originals-off',
    ]
    expect(codes.every(isTransient)).toBe(true)
    expect(others.some(isTransient)).toBe(false)
  })

  it('never stops the saves, so a held original is not mistaken for a limit', () => {
    expect(stopsSaving('original-unsent')).toBe(false)
  })
})
