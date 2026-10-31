import { afterEach, describe, expect, it, vi } from 'vitest'
import { openManifestStore } from '../ui/importManifestStore'
import { deleteAccountDetails } from './deleteAccountDetails'
import { deleteWorkbenchScope } from './workbenchStore'

vi.mock('./workbenchStore', () => ({ deleteWorkbenchScope: vi.fn() }))

vi.mock('../ui/importManifestStore', () => {
  const forget = vi.fn(async () => undefined)
  return { openManifestStore: () => ({ forget }) }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('account recording cleanup after server deletion', () => {
  it('does not open a cache for an unavailable account or browser without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await deleteAccountDetails('alice')).toBeNull()
    vi.stubGlobal('indexedDB', {})
    expect(await deleteAccountDetails(undefined)).toBeNull()
    expect(deleteWorkbenchScope).not.toHaveBeenCalled()
  })

  it('tombstones only the deleted account', async () => {
    vi.stubGlobal('indexedDB', {})
    vi.mocked(deleteWorkbenchScope).mockResolvedValue(true)
    expect(await deleteAccountDetails('alice')).toBeNull()
    expect(deleteWorkbenchScope).toHaveBeenCalledExactlyOnceWith({
      kind: 'account',
      userId: 'alice',
    })
  })

  it.each(['refused', 'throws'])(
    'reports local cleanup that %s separately from server deletion',
    async (failure) => {
      vi.stubGlobal('indexedDB', {})
      if (failure === 'throws')
        vi.mocked(deleteWorkbenchScope).mockRejectedValue(new Error('closed'))
      else vi.mocked(deleteWorkbenchScope).mockResolvedValue(false)
      expect(await deleteAccountDetails('alice')).toMatch(
        /account was deleted.*could not be removed.*Clear this site/s,
      )
    },
  )
})

describe('the record of the account’s imports', () => {
  it('is forgotten with the recordings, for that account only', async () => {
    vi.stubGlobal('indexedDB', {})
    vi.mocked(deleteWorkbenchScope).mockResolvedValue(true)

    await deleteAccountDetails('alice')

    expect(openManifestStore().forget).toHaveBeenCalledExactlyOnceWith('account:alice')
  })
})
