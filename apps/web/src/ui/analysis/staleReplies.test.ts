import { describe, expect, it } from 'vitest'
import type { Account, Pending } from './model'
import { isOvertaken, isStaleDeviceList } from './staleReplies'

/** A pending request with the numbering a real one carries. */
function pend(kind: Pending['kind'], session: number, id = 1): Pending {
  return { id, kind, session, sentAt: 0 }
}

function transportWith(pending: Pending[], epoch = 2) {
  return { pendingRepliesRef: { current: pending }, sessionEpochRef: { current: epoch } }
}

const account = (status: Account['status']) => ({ current: { status, me: null } })

describe('isOvertaken', () => {
  it('is true for a library read sent before the last Start over or sign-in', () => {
    const transport = transportWith([])
    expect(isOvertaken(transport, pend('loadDevice', 1))).toBe(true)
    expect(isOvertaken(transport, pend('loadServer', 1))).toBe(true)
    expect(isOvertaken(transport, pend('loadDevice', 2))).toBe(false)
    expect(isOvertaken(transport, pend('addFiles', 1))).toBe(false)
  })
})

describe('isStaleDeviceList', () => {
  it('keeps the list of nothing waiting', () => {
    expect(isStaleDeviceList(transportWith([]), account('signed-out'))).toBe(false)
  })

  it('drops the list of a kept library read that was overtaken', () => {
    const transport = transportWith([pend('loadDevice', 1)])
    expect(isStaleDeviceList(transport, account('signed-out'))).toBe(true)
  })

  it('keeps the account’s own list when a Start over overtook its load', () => {
    const transport = transportWith([pend('loadServer', 1)])
    expect(isStaleDeviceList(transport, account('signed-in'))).toBe(false)
  })

  it.each(['loadDevice', 'keepProvisional', 'deleteDeviceActivity'] as const)(
    'drops the list a %s posts once the page is signed in, however current the request is',
    (kind) => {
      const transport = transportWith([pend(kind, 2)])
      expect(isStaleDeviceList(transport, account('signed-in'))).toBe(true)
      expect(isStaleDeviceList(transport, account('signed-out'))).toBe(false)
    },
  )

  it('reads the request a list ran under, not the oldest one waiting', () => {
    const transport = transportWith([pend('rebuildStale', 2, 1), pend('loadDevice', 1, 2)])
    expect(isStaleDeviceList(transport, account('signed-out'))).toBe(false)
    expect(isStaleDeviceList(transport, account('signed-out'), 2)).toBe(true)
    expect(isStaleDeviceList(transport, account('signed-out'), 9)).toBe(false)
  })

  it('keeps a list posted for any other request while signed in', () => {
    const transport = transportWith([pend('rebuildStale', 2)])
    expect(isStaleDeviceList(transport, account('signed-in'))).toBe(false)
  })
})
