// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBroadcastChannel } from '../test/fakeBroadcastChannel'
import { ready, types, stubFakeWorker } from '../test/signedInAnalysis'
import { RELOAD_DEBOUNCE_MS } from './analysis/libraryTabs'
import { resetTabSync } from './tabSync'

vi.mock(
  './analysis/workerStart',
  async () => (await import('../test/workerStartsAtOnce')).workerStart,
)

stubFakeWorker()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  resetTabSync()
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => {
  vi.useRealTimers()
  resetTabSync()
})

describe('the library read again for another tab’s change', () => {
  it('keeps the status loaded while it is read, so a rename or delete made meanwhile is not refused', () => {
    const { result } = ready()
    const otherTab = FakeBroadcastChannel.other('rca-sync-v1')
    const before = types().filter((type) => type === 'loadServer').length
    act(() => otherTab.postMessage({ type: 'library', scope: 'account' }))
    act(() => void vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 10))
    expect(types().filter((type) => type === 'loadServer')).toHaveLength(before + 1)
    expect(result.current.libraryStatus).toBe('loaded')
  })
})
