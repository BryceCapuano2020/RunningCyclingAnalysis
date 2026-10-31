import type { WireRequest, WireStamp, WorkerRequest, WorkerResponse } from '../worker/protocol'
import { REPLY_TYPES } from '../worker/protocol'

/** The request kinds a typed reply can answer. Other replies (state, error, rebuildComplete) answer any. */
const ANSWERS: Partial<Record<WorkerResponse['type'], ReadonlySet<WorkerRequest['type']>>> = {
  routeShape: new Set<WorkerRequest['type']>(['routeShape', 'forgetRoutes']),
  activityTrace: new Set<WorkerRequest['type']>(['activityTrace']),
  splits: new Set<WorkerRequest['type']>(['activitySplits']),
  exportReady: new Set<WorkerRequest['type']>(['exportData']),
}

/**
 * A Worker for page tests. It records what the page posts, without the number the transport adds, and
 * stamps what a test replies the way the real worker does: a reply names the oldest request of a kind it
 * can answer that is still unanswered, and any other message names the oldest request still running, or
 * the last one answered when none is (the real worker keeps naming it, so a late event is stray, as it
 * is there). Pass a stamp to name a particular request instead, or `{}` to send an unnumbered message.
 */
export class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<WorkerResponse & WireStamp>) => void) | null = null
  onmessageerror: (() => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  /** The requests posted, as the page made them. */
  posted: WorkerRequest[] = []
  /** The number of each posted request, in the same order. */
  ids: number[] = []
  terminated = false
  /** When set, the next postMessage throws it, as a browser does for a value it cannot copy. */
  throwOnPost: Error | null = null
  private answered = new Set<number>()
  private lastAnswered: number | undefined

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(request: WireRequest) {
    if (this.throwOnPost !== null) {
      const failure = this.throwOnPost
      this.throwOnPost = null
      throw failure
    }
    const { requestId, ...rest } = request
    this.posted.push(rest as WorkerRequest)
    this.ids.push(requestId)
  }

  terminate() {
    this.terminated = true
  }

  /** The number of the request a message of this type belongs to, or undefined when none is waiting. */
  private ownerOf(type: WorkerResponse['type']): number | undefined {
    const kinds = ANSWERS[type]
    const index = this.ids.findIndex(
      (id, i) => !this.answered.has(id) && (kinds === undefined || kinds.has(this.posted[i]!.type)),
    )
    return index < 0 ? undefined : this.ids[index]
  }

  reply(data: WorkerResponse, stamp?: WireStamp) {
    let message: WorkerResponse & WireStamp = data
    if (stamp !== undefined) message = { ...data, ...stamp }
    else {
      const owner = this.ownerOf(data.type)
      if (owner !== undefined && REPLY_TYPES.has(data.type)) {
        this.answered.add(owner)
        this.lastAnswered = owner
        message = { ...data, replyTo: owner }
      } else if (!REPLY_TYPES.has(data.type)) {
        const during = owner ?? this.lastAnswered
        if (during !== undefined) message = { ...data, during }
      }
    }
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse & WireStamp>)
  }

  fail() {
    this.onerror?.({ message: 'module failed' } as ErrorEvent)
  }
}
