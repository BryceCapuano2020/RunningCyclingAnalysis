import { describe, expect, it } from 'vitest'
import type { Account, Pending } from './model'
import { isOvertaken, isStaleDeviceList } from './staleReplies'

function transportWith(pending: Pending[], epoch = 2) {
  return { pendingRepliesRef: { current: pending }, sessionEpochRef: { current: epoch } }
}

const account = (status: Account['status']) => ({ current: { status, me: null } })

describe('isOvertaken', () => {
  it('is true for a library read sent before the last Start over or sign-in', () => {
    const transport = transportWith([])
    expect(isOvertaken(transport, { kind: 'loadDevice', session: 1 })).toBe(true)
    expect(isOvertaken(transport, { kind: 'loadServer', session: 1 })).toBe(true)
    expect(isOvertaken(transport, { kind: 'loadDevice', session: 2 })).toBe(false)
    expect(isOvertaken(transport, { kind: 'addFiles', session: 1 })).toBe(false)
  })
})

describe('isStaleDeviceList', () => {
  it('keeps the list of nothing waiting', () => {
    expect(isStaleDeviceList(transportWith([]), account('signed-out'))).toBe(false)
  })

  it('drops the list of a kept library read that was overtaken', () => {
    const transport = transportWith([{ kind: 'loadDevice', session: 1 }])
    expect(isStaleDeviceList(transport, account('signed-out'))).toBe(true)
  })

  it('keeps the account’s own list when a Start over overtook its load', () => {
    const transport = transportWith([{ kind: 'loadServer', session: 1 }])
    expect(isStaleDeviceList(transport, account('signed-in'))).toBe(false)
  })

  it.each(['loadDevice', 'keepProvisional', 'deleteDeviceActivity'] as const)(
    'drops the list a %s posts once the page is signed in, however current the request is',
    (kind) => {
      const transport = transportWith([{ kind, session: 2 }])
      expect(isStaleDeviceList(transport, account('signed-in'))).toBe(true)
      expect(isStaleDeviceList(transport, account('signed-out'))).toBe(false)
    },
  )

  it('keeps a list posted for any other request while signed in', () => {
    const transport = transportWith([{ kind: 'rebuildStale', session: 2 }])
    expect(isStaleDeviceList(transport, account('signed-in'))).toBe(false)
  })
})
