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
    await forgetAccountDetails('alice')
    vi.stubGlobal('indexedDB', {})
    await forgetAccountDetails(undefined)
    expect(clearWorkbenchScope).not.toHaveBeenCalled()
  })

  it('clears only the signed-out account, leaving it free to be written again', async () => {
    vi.stubGlobal('indexedDB', {})
    vi.mocked(clearWorkbenchScope).mockResolvedValue(true)
    await forgetAccountDetails('alice')
    expect(clearWorkbenchScope).toHaveBeenCalledExactlyOnceWith({
      kind: 'account',
      userId: 'alice',
    })
  })

  it('does not fail the sign-out when the cleanup is refused or throws', async () => {
    vi.stubGlobal('indexedDB', {})
    vi.mocked(clearWorkbenchScope).mockRejectedValue(new Error('closed'))
    await expect(forgetAccountDetails('alice')).resolves.toBeUndefined()
    vi.mocked(clearWorkbenchScope).mockResolvedValue(false)
    await expect(forgetAccountDetails('alice')).resolves.toBeUndefined()
  })
})
