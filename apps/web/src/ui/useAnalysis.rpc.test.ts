// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../test/fakeWorker'
import { STILL_WORKING } from './analysis/copy'
import { EMPTY_PERIOD } from './analysis/model'
import { WATCHDOG_MS } from './analysis/workerWatchdog'
import { useAnalysis } from './useAnalysis'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const SIGNED_OUT = { status: 'signed-out' as const, me: null }
const FILE = new File(['x'], 'run.fit')

function stateWith(totalActivities: number): SessionState {
  return {
    result: null,
    rejected: [],
    unsupportedFiles: 0,
    isSample: false,
    totalActivities,
    period: EMPTY_PERIOD,
    library: [],
    syncIssues: [],
    outdatedActivities: 0,
    incompatibleActivities: 0,
    hiddenDuplicates: 0,
    walkingPaceRuns: 0,
    trend: [],
    previous: null,
    effortTrends: NO_TRENDS,
    sameHeartRate: NO_SAME_HEART_RATE,
    lateEvidence: NO_LATE_EVIDENCE,
    heartRateJudgement: NO_HEART_RATE_JUDGEMENT,
    fitness: NO_FITNESS,
    zoneEstimates: null,
    timeInZones: NO_ZONE_TIMES,
    records: new Map(),
  }
}

const worker = (): FakeWorker => FakeWorker.instances.at(-1)!

/** A signed-out page whose kept library has loaded, so the next request is the test's own. */
function ready() {
  const hook = renderHook(() => useAnalysis(SETTINGS, SIGNED_OUT, false))
  act(() => worker().reply({ type: 'state', state: stateWith(0) }))
  return hook
}

/** The worker begins the request with this number. */
const begin = (id: number) => act(() => worker().reply({ type: 'started' }, { during: id }))
/** Time passes, with the watchdog looking every few seconds as it does. */
const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('replies are matched to their request by number', () => {
  it('settles each pick with its own reply, whatever order the replies arrive in', () => {
    const { result } = ready()
    const first = vi.fn()
    const second = vi.fn()
    act(() => result.current.setRange(30, first))
    act(() => result.current.setRange(90, second))
    const [, one, two] = worker().ids

    act(() => worker().reply({ type: 'state', state: stateWith(2) }, { replyTo: two }))
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    act(() => worker().reply({ type: 'state', state: stateWith(1) }, { replyTo: one }))
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('drops a reply that names no request waiting, and one that names none at all', () => {
    const { result } = ready()
    act(() => worker().reply({ type: 'state', state: stateWith(5) }, { replyTo: 9999 }))
    act(() => worker().reply({ type: 'state', state: stateWith(6) }, {}))
    expect(result.current.state.totalActivities).toBe(0)
  })

  it('drops a reply that arrives twice', () => {
    const { result } = ready()
    act(() => result.current.setRange(30))
    const id = worker().ids.at(-1)!
    act(() => worker().reply({ type: 'state', state: stateWith(1) }, { replyTo: id }))
    act(() => worker().reply({ type: 'state', state: stateWith(2) }, { replyTo: id }))
    expect(result.current.state.totalActivities).toBe(1)
  })

  it('drops a progress message that arrives after its request was settled', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const id = worker().ids.at(-1)!
    act(() => worker().reply({ type: 'state', state: stateWith(1) }, { replyTo: id }))
    act(() => worker().reply({ type: 'progress', filesRead: 4, filesTotal: 9 }, { during: id }))
    expect(result.current.progress).toBeNull()
  })

  it('numbers a request that waited for a worker when it reaches one', () => {
    const { result } = ready()
    act(() => worker().fail())
    act(() => worker().fail())
    expect(result.current.workerStopped).toBe(true)
    act(() => result.current.retryWorker())
    // The restarted worker is numbered from the page's counter, which never goes back.
    expect(worker().ids.every((id) => id > 1)).toBe(true)
  })
})

describe('a request the browser cannot send', () => {
  it('says so, drops the request and leaves the page not busy', () => {
    const { result } = ready()
    worker().throwOnPost = new DOMException('could not be cloned', 'DataCloneError')
    act(() => result.current.addFiles([FILE]))
    expect(result.current.error).toBe(
      'These files could not be sent to the analysis. Add them again.',
    )
    expect(result.current.busy).toBe(false)
  })
})

describe('the watchdog', () => {
  it('says a long request is slow, then takes the notice back when it makes headway', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const id = worker().ids.at(-1)!
    begin(id)
    pass(95_000)
    expect(result.current.error).toBe(STILL_WORKING)
    expect(result.current.errorNeutral).toBe(true)
    act(() => worker().reply({ type: 'heartbeat', progress: 1 }, { during: id }))
    pass(WATCHDOG_MS)
    expect(result.current.error).toBeNull()
  })

  it('replaces a worker whose request makes no headway, and does not send the request again', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const stalled = worker()
    begin(stalled.ids.at(-1)!)
    pass(185_000)
    expect(worker()).not.toBe(stalled)
    expect(stalled.terminated).toBe(true)
    expect(result.current.error).toContain('Analysis stopped responding.')
    expect(worker().posted.some((request) => request.type === 'addFiles')).toBe(false)
  })

  it('counts a heartbeat that reports the same work as alive, not as headway', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const stalled = worker()
    const id = stalled.ids.at(-1)!
    begin(id)
    for (let at = 0; at < 170_000; at += 2_000) {
      act(() => worker().reply({ type: 'heartbeat', progress: 3 }, { during: id }))
      pass(2_000)
    }
    pass(20_000)
    expect(worker()).not.toBe(stalled)
  })

  it('keeps a worker whose request keeps moving', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const running = worker()
    const id = running.ids.at(-1)!
    begin(id)
    for (let beat = 1; beat <= 60; beat++) {
      act(() => worker().reply({ type: 'heartbeat', progress: beat }, { during: id }))
      pass(5_000)
    }
    expect(worker()).toBe(running)
    expect(result.current.error).toBeNull()
  })

  it('does not time a request that waits behind a running one', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const running = worker()
    begin(running.ids.at(-1)!)
    act(() => result.current.setRange(30))
    for (let beat = 1; beat <= 30; beat++) {
      act(() =>
        worker().reply({ type: 'heartbeat', progress: beat }, { during: running.ids.at(-2)! }),
      )
      pass(5_000)
    }
    expect(worker()).toBe(running)
  })

  it('lets a stalled single read go as unread, without a word, and leaves the worker alone', async () => {
    const { result } = ready()
    const running = worker()
    let reply: Promise<{ kind: string }> | undefined
    act(() => {
      reply = result.current.loadRoute('run-1', false)
    })
    begin(running.ids.at(-1)!)
    pass(25_000)
    expect(result.current.error).toBeNull()
    pass(10_000)
    await expect(reply).resolves.toEqual({ kind: 'failed' })
    expect(worker()).toBe(running)
    expect(result.current.error).toBeNull()
  })

  /** A read the watchdog lets go while the worker is still running it, with a request queued behind it. */
  function releasedReadWithQueuedRequest() {
    const hook = ready()
    const running = worker()
    act(() => {
      void hook.result.current.loadRoute('run-1', false)
    })
    const readId = running.ids.at(-1)!
    begin(readId)
    act(() => hook.result.current.setRange(30))
    pass(35_000)
    return { running, readId }
  }

  it('keeps a request that waits behind a let-go read while that read is getting somewhere', () => {
    const { running, readId } = releasedReadWithQueuedRequest()
    for (let beat = 1; beat <= 80; beat++) {
      act(() => worker().reply({ type: 'heartbeat', progress: beat }, { during: readId }))
      pass(2_000)
    }
    expect(worker()).toBe(running)
  })

  it('replaces the worker when a let-go read hangs, beating without getting anywhere', () => {
    const { running, readId } = releasedReadWithQueuedRequest()
    for (let at = 0; at < 90_000; at += 2_000) {
      act(() => worker().reply({ type: 'heartbeat', progress: 7 }, { during: readId }))
      pass(2_000)
    }
    expect(worker()).not.toBe(running)
  })

  it('shows the notice again for a stall that went on after another request cleared it', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    begin(worker().ids.at(-1)!)
    pass(95_000)
    expect(result.current.error).toBe(STILL_WORKING)
    // Sending another request clears the notices, as it always does; the stall is still there.
    act(() => result.current.setRange(30))
    expect(result.current.error).toBeNull()
    pass(WATCHDOG_MS)
    expect(result.current.error).toBe(STILL_WORKING)
  })

  it('does not replace an error already on screen with the notice', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    begin(worker().ids.at(-1)!)
    act(() => result.current.setRange(30))
    const pick = worker().ids.at(-1)!
    act(() => worker().reply({ type: 'error', message: 'Something failed' }, { replyTo: pick }))
    expect(result.current.error).toBe('Something failed')
    pass(95_000)
    expect(result.current.error).toBe('Something failed')
  })
})

describe('the watchdog after time the page lost', () => {
  it('does not take a suspended page for a silent worker', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const running = worker()
    begin(running.ids.at(-1)!)
    // The laptop sleeps for five minutes: no tick runs, then the clock is ahead.
    vi.setSystemTime(Date.now() + 300_000)
    pass(WATCHDOG_MS)
    expect(worker()).toBe(running)
    expect(result.current.error).toBeNull()
    // Silence after the page woke still counts.
    pass(185_000)
    expect(worker()).not.toBe(running)
  })

  it('is not fooled by flipping tabs: a hung worker is still replaced after its stall time', () => {
    const { result } = ready()
    act(() => result.current.addFiles([FILE]))
    const running = worker()
    const id = running.ids.at(-1)!
    begin(id)
    for (let at = 0; at < 170_000; at += 2_000) {
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      act(() => worker().reply({ type: 'heartbeat', progress: 4 }, { during: id }))
      pass(2_000)
    }
    pass(20_000)
    expect(worker()).not.toBe(running)
  })
})

describe('messages the browser cannot read', () => {
  it('counts one or two and carries on, and replaces the worker at three in a row', () => {
    ready()
    const first = worker()
    act(() => first.onmessageerror?.())
    act(() => first.onmessageerror?.())
    expect(worker()).toBe(first)
    // A readable message in between starts the count again.
    act(() => first.reply({ type: 'missingOriginals', count: 0 }, {}))
    act(() => first.onmessageerror?.())
    act(() => first.onmessageerror?.())
    expect(worker()).toBe(first)
    act(() => first.onmessageerror?.())
    expect(worker()).not.toBe(first)
  })
})
