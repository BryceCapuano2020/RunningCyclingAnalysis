import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetAccountDetails } from './forgetAccountDetails'
import { clearWorkbenchScope } from './workbenchStore'

vi.mock('./workbenchStore', () => ({ clearWorkbenchScope: vi.fn() }))

const outboxes = vi.hoisted(() => new Map<string, { forget: ReturnType<typeof vi.fn> }>())
vi.mock('./outbox', () => ({
  openOutbox: (userId: string) => {
    const outbox = outboxes.get(userId) ?? { forget: vi.fn(async () => undefined) }
    outboxes.set(userId, outbox)
    return outbox
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  outboxes.clear()
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

describe('the activities still waiting to be saved', () => {
  it('are forgotten with the recordings when the visitor signs out, for that account only', async () => {
    vi.stubGlobal('indexedDB', {})
    vi.mocked(clearWorkbenchScope).mockResolvedValue(true)

    await forgetAccountDetails('alice')

    expect(outboxes.get('alice')?.forget).toHaveBeenCalledOnce()
    expect(outboxes.has('bob')).toBe(false)
  })

  it('are kept when the server ended the session, for the account’s next sign-in', async () => {
    vi.stubGlobal('indexedDB', {})
    vi.mocked(clearWorkbenchScope).mockResolvedValue(true)

    await forgetAccountDetails('alice', true)

    expect(outboxes.has('alice')).toBe(false)
  })
})
