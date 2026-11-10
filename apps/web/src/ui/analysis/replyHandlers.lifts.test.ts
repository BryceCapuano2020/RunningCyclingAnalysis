// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_SESSION } from './model'
import type { Pending } from './model'
import { handleReply } from './replyHandlers'
import type { WorkerEventDeps } from './replyHandlers'

const announce = vi.hoisted(() => vi.fn())
vi.mock('../lift/liftsCleared', () => ({ announceLiftsCleared: announce }))

/** Every dependency answers any call or read with another stand-in, so only the lifting call is watched. */
function standIn(own: Record<string, unknown> = {}): unknown {
  const target = () => undefined
  return new Proxy(target, {
    get: (_, key) =>
      typeof key === 'string' && key in own
        ? own[key]
        : key === Symbol.toPrimitive
          ? () => 0
          : standIn(),
    apply: () => undefined,
  })
}

function reply(pending: Pending): void {
  const deps = {
    transport: {
      pendingRepliesRef: { current: [pending] },
      automaticRestartCountRef: { current: 0 },
      sessionEpochRef: { current: 0 },
      setWorkerStopped: () => undefined,
    },
    imports: standIn(),
    library: standIn({ savedActivitiesRef: { current: [] } }),
    refreshBusy: () => undefined,
    libraryChanged: () => undefined,
  } as unknown as WorkerEventDeps
  handleReply(deps, { type: 'state', state: EMPTY_SESSION } as never, pending)
}

const request = (over: Partial<Pending>): Pending => ({ id: 1, sentAt: 0, kind: 'clear', ...over })

beforeEach(() => announce.mockReset())

describe('Remove all and the lifting log', () => {
  it('announces the cleared lifts for a clear that forgets the device', () => {
    reply(request({ forgetDevice: true }))
    expect(announce).toHaveBeenCalledTimes(1)
  })
  it('says nothing for a clear that keeps the device, or any other request', () => {
    reply(request({ forgetDevice: false }))
    reply(request({}))
    reply(request({ kind: 'deleteDeviceActivity', forgetDevice: true }))
    expect(announce).not.toHaveBeenCalled()
  })
})
