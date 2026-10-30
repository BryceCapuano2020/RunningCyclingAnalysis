// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBroadcastChannel } from '../test/fakeBroadcastChannel'
import { resetTabSync, tellOtherTabs, useTabMessages } from './tabSync'

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  resetTabSync()
  vi.unstubAllGlobals()
})

describe('tab messages', () => {
  it('tells the other tabs, which hear it, and not this one', () => {
    const heard = vi.fn()
    renderHook(() => useTabMessages(heard))
    const other = FakeBroadcastChannel.other('rca-sync-v1')
    const otherHeard = vi.fn()
    other.onmessage = (event) => otherHeard(event.data)

    tellOtherTabs({ type: 'profile' })

    expect(otherHeard).toHaveBeenCalledWith({ type: 'profile' })
    expect(heard).not.toHaveBeenCalled()
  })

  it('hears what another tab says, for as long as the component is mounted', () => {
    const heard = vi.fn()
    const view = renderHook(() => useTabMessages(heard))
    const other = FakeBroadcastChannel.other('rca-sync-v1')

    other.postMessage({ type: 'account', change: 'signed-out' })
    expect(heard).toHaveBeenCalledWith({ type: 'account', change: 'signed-out' })

    view.unmount()
    other.postMessage({ type: 'profile' })
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('ignores what is not a message this version knows', () => {
    const heard = vi.fn()
    renderHook(() => useTabMessages(heard))
    const other = FakeBroadcastChannel.other('rca-sync-v1')

    other.postMessage(null)
    other.postMessage('profile')
    other.postMessage({ type: 'nonsense' })
    other.postMessage({ type: 'account', change: 'signed-in' })
    other.postMessage({ type: 'account' })

    expect(heard).not.toHaveBeenCalled()
  })

  it('does nothing where the browser has no channels', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('BroadcastChannel', undefined)
    resetTabSync()
    expect(() => tellOtherTabs({ type: 'profile' })).not.toThrow()
    expect(() => renderHook(() => useTabMessages(vi.fn()))).not.toThrow()
  })

  it('does not throw when a channel refuses the message', () => {
    class Refusing extends FakeBroadcastChannel {
      override postMessage(): void {
        throw new DOMException('closed', 'InvalidStateError')
      }
    }
    vi.stubGlobal('BroadcastChannel', Refusing)
    resetTabSync()
    expect(() => tellOtherTabs({ type: 'profile' })).not.toThrow()
  })
})
