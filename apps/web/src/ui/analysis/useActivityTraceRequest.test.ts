// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account, Box } from './model'
import type { WorkerTransport } from './workerTransport'
import { useActivityTraceRequest } from './useActivityTraceRequest'

const account: Box<Account> = { current: { status: 'signed-out', me: null } }

describe('activity detail requests', () => {
  it('settles a refused request as failed rather than leaving a loading promise', async () => {
    const send = vi.fn<WorkerTransport['send']>(() => false)
    const { result } = renderHook(() => useActivityTraceRequest(send, account))
    await expect(result.current('activity-1')).resolves.toEqual({ kind: 'failed' })
  })

  it('reads the local cache without requesting the original by default', async () => {
    const send = vi.fn<WorkerTransport['send']>((_request, _notice, settle) => {
      settle?.({ type: 'activityTrace', reply: { kind: 'missing' } })
      return true
    })
    const { result } = renderHook(() => useActivityTraceRequest(send, account))
    await expect(result.current('activity-1')).resolves.toEqual({ kind: 'missing' })
    expect(send.mock.calls[0]?.[0]).toEqual({
      type: 'activityTrace',
      id: 'activity-1',
      fromOriginal: false,
    })
  })

  it('preserves explicit original-file consent and settles an interrupted read', async () => {
    const send = vi.fn<WorkerTransport['send']>((_request, _notice, settle) => {
      settle?.(null)
      return true
    })
    const { result } = renderHook(() => useActivityTraceRequest(send, account))
    await expect(result.current('activity-1', true)).resolves.toEqual({ kind: 'failed' })
    expect(send.mock.calls[0]?.[0]).toMatchObject({ fromOriginal: true })
  })
})
