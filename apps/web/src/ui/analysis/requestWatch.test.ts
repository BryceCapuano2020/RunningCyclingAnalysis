import { describe, expect, it } from 'vitest'
import type { WorkerRequest } from '../../worker/protocol'
import type { Pending } from './model'
import { noteActivity, resetActivity, START_LIMIT_MS, stallOf } from './requestWatch'

const T0 = 1_000_000

function pend(id: number, kind: WorkerRequest['type'], extra: Partial<Pending> = {}): Pending {
  return { id, kind, sentAt: T0, ...extra }
}

function started(id: number, kind: WorkerRequest['type'], at = T0): Pending {
  const pending = pend(id, kind)
  noteActivity(pending, { type: 'started' }, at)
  return pending
}

describe('stallOf', () => {
  it('has nothing to say about an empty list', () => {
    expect(stallOf([], T0)).toBeNull()
  })

  it('times the request the worker began, from when it began, not from when it was sent', () => {
    const waiting = [started(1, 'addFiles', T0 + 600_000), pend(2, 'setRange')]
    expect(stallOf(waiting, T0 + 600_000 + 44_000)?.stall).toBe('ok')
  })

  it('says a long request is slow, then stalled, with no headway', () => {
    const waiting = [started(1, 'addFiles')]
    expect(stallOf(waiting, T0 + 89_999)?.stall).toBe('ok')
    expect(stallOf(waiting, T0 + 90_000)?.stall).toBe('slow')
    // Longer than an original-file transfer's 120 s deadline, so a slow download is not a stall.
    expect(stallOf(waiting, T0 + 150_000)?.stall).toBe('slow')
    expect(stallOf(waiting, T0 + 180_000)?.stall).toBe('restart')
  })

  it('counts a heartbeat whose work count moved as headway, and one that did not as only alive', () => {
    const pending = started(1, 'addFiles')
    noteActivity(pending, { type: 'heartbeat', progress: 0 }, T0 + 40_000)
    noteActivity(pending, { type: 'heartbeat', progress: 5 }, T0 + 80_000)
    noteActivity(pending, { type: 'heartbeat', progress: 5 }, T0 + 120_000)
    expect(stallOf([pending], T0 + 80_000 + 89_000)?.stall).toBe('ok')
    expect(stallOf([pending], T0 + 80_000 + 100_000)?.stall).toBe('slow')
    expect(stallOf([pending], T0 + 80_000 + 180_000)?.stall).toBe('restart')
  })

  it('counts any other message about the request as headway', () => {
    const pending = started(1, 'addFiles')
    noteActivity(pending, { type: 'progress', filesRead: 1 }, T0 + 80_000)
    expect(stallOf([pending], T0 + 160_000)?.stall).toBe('ok')
  })

  it('lets a stalled single read go without a word, and without touching the worker', () => {
    const waiting = [started(1, 'routeShape')]
    expect(stallOf(waiting, T0 + 29_999)?.stall).toBe('ok')
    expect(stallOf(waiting, T0 + 30_000)?.stall).toBe('release')
  })

  it('gives a read from the kept original file the time of a download', () => {
    const read = started(1, 'activityTrace')
    read.fromOriginal = true
    expect(stallOf([read], T0 + 149_999)?.stall).toBe('ok')
    expect(stallOf([read], T0 + 150_000)?.stall).toBe('release')
  })

  it('uses the short limits for analysis that answers in moments', () => {
    const waiting = [started(1, 'setRange')]
    expect(stallOf(waiting, T0 + 30_000)?.stall).toBe('slow')
    expect(stallOf(waiting, T0 + 60_000)?.stall).toBe('restart')
  })

  it('treats keeping the analysed files as long work', () => {
    expect(stallOf([started(1, 'keepProvisional')], T0 + 100_000)?.stall).toBe('slow')
  })

  it('does not time requests that wait behind a running one', () => {
    const waiting = [started(1, 'addFiles', T0), pend(2, 'setRange')]
    expect(stallOf(waiting, T0 + 10_000)).toMatchObject({ stall: 'ok' })
    expect(stallOf(waiting, T0 + 10_000)?.pending.id).toBe(1)
  })

  it('counts a worker that has begun nothing for a minute as not answering', () => {
    const waiting = [pend(1, 'setRange')]
    expect(stallOf(waiting, T0 + START_LIMIT_MS - 1)?.stall).toBe('ok')
    expect(stallOf(waiting, T0 + START_LIMIT_MS)?.stall).toBe('restart')
  })

  it('does not count a worker that keeps speaking as silent, such as one still busy with a read the page let go', () => {
    const waiting = [pend(1, 'setRange')]
    const heard = T0 + START_LIMIT_MS - 1_000
    expect(stallOf(waiting, T0 + START_LIMIT_MS, heard)?.stall).toBe('ok')
    expect(stallOf(waiting, heard + START_LIMIT_MS, heard)?.stall).toBe('restart')
  })
})

describe('resetActivity', () => {
  it('starts every running wait again from now, and leaves the waits that have not begun alone', () => {
    const running = started(1, 'addFiles')
    const waiting = pend(2, 'setRange')
    resetActivity([running, waiting], T0 + 300_000)
    expect(running.activeAt).toBe(T0 + 300_000)
    expect(waiting.activeAt).toBeUndefined()
    expect(stallOf([running], T0 + 300_000 + 89_000)?.stall).toBe('ok')
  })
})
