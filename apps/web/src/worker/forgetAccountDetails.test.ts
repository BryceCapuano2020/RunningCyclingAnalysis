import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetAccountDetails } from './forgetAccountDetails'
import { clearWorkbenchScope } from './workbenchStore'

vi.mock('./workbenchStore', () => ({ clearWorkbenchScope: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('account recording cleanup after sign-out', () => {
  it('does not open a cache for an unknown account or a browser without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await forgetAccountDetails('alice')).toBeNull()
    vi.stubGlobal('indexedDB', {})
    expect(await forgetAccountDetails(undefined)).toBeNull()
    expect(clearWorkbenchScope).not.toHaveBeenCalled()
  })

  it('clears only the signed-out account and has nothing to report', async () => {
    vi.stubGlobal('indexedDB', {})
    vi.mocked(clearWorkbenchScope).mockResolvedValue(true)
    expect(await forgetAccountDetails('alice')).toBeNull()
    expect(clearWorkbenchScope).toHaveBeenCalledExactlyOnceWith({
      kind: 'account',
      userId: 'alice',
    })
  })

  it.each(['refused', 'throws'])(
    'reports a cleanup that %s, without failing the sign-out',
    async (failure) => {
      vi.stubGlobal('indexedDB', {})
      if (failure === 'throws')
        vi.mocked(clearWorkbenchScope).mockRejectedValue(new Error('closed'))
      else vi.mocked(clearWorkbenchScope).mockResolvedValue(false)
      expect(await forgetAccountDetails('alice')).toMatch(
        /signed out.*could not be cleared from this browser.*Clear this site/s,
      )
    },
  )
})
