import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WireStamp, WorkerResponse } from './protocol'
import { beginRequest, HEARTBEAT_MS, noteWork, stamped } from './workerWire'

const STATE_REPLY = { type: 'error', message: 'x' } as const
const EVENT = { type: 'missingOriginals', count: 1 } as const

describe('worker wire stamps', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('leaves a message alone when the request had no number', () => {
    const end = beginRequest(undefined, () => undefined)
    expect(stamped(STATE_REPLY)).toBe(STATE_REPLY)
    end()
  })

  it('stamps replies with replyTo and events with during, for the request being run', () => {
    const sent: unknown[] = []
    const end = beginRequest(7, (m) => sent.push(m))
    expect(stamped(STATE_REPLY)).toEqual({ ...STATE_REPLY, replyTo: 7 })
    expect(stamped(EVENT)).toEqual({ ...EVENT, during: 7 })
    expect(sent).toEqual([{ type: 'started', during: 7 }])
    end()
  })

  it('keeps naming the last request after it ends, so a late message is stray, not news', () => {
    const end = beginRequest(3, () => undefined)
    end()
    expect(stamped(EVENT)).toEqual({ ...EVENT, during: 3 })
  })

  it('beats while the request runs with the work done so far, and stops when it ends', () => {
    const sent: (WorkerResponse & WireStamp)[] = []
    const end = beginRequest(9, (m) => sent.push(m))
    noteWork()
    vi.advanceTimersByTime(HEARTBEAT_MS)
    noteWork()
    noteWork()
    vi.advanceTimersByTime(HEARTBEAT_MS)
    const beats = sent.filter((m) => m.type === 'heartbeat')
    expect(beats).toHaveLength(2)
    const [first, second] = beats as { progress: number }[]
    expect(second!.progress - first!.progress).toBe(2)
    expect(beats.every((m) => m.during === 9)).toBe(true)
    end()
    vi.advanceTimersByTime(HEARTBEAT_MS * 3)
    expect(sent.filter((m) => m.type === 'heartbeat')).toHaveLength(2)
  })
})
