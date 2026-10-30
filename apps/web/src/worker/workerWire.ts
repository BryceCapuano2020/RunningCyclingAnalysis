import { REPLY_TYPES } from './protocol'
import type { WireStamp, WorkerResponse } from './protocol'

/** How often a running request tells the page it is alive. */
export const HEARTBEAT_MS = 2_000

/**
 * The request the worker is handling, or handled last. It stays set after the request ends, so a
 * message that arrives late (a throttled progress) still names a request the page has settled, and is
 * dropped there instead of being taken for news.
 */
let current: number | undefined
/** Units of real work done: files read, activities saved. A count that stops moving is a stall. */
let work = 0

/** Records one unit of real work, which the heartbeat reports. */
export function noteWork(): void {
  work++
}

/** The message with the number of the request it belongs to, when that request had one. */
export function stamped(message: WorkerResponse): WorkerResponse & WireStamp {
  if (current === undefined) return message
  return REPLY_TYPES.has(message.type)
    ? { ...message, replyTo: current }
    : { ...message, during: current }
}

/**
 * Marks the start of a request: tells the page it has begun, and keeps telling it the work count until
 * the returned function is called. A request without a number (a test, an older page) is not announced.
 */
export function beginRequest(
  requestId: number | undefined,
  send: (message: WorkerResponse & WireStamp) => void,
): () => void {
  current = requestId
  if (requestId === undefined) return () => undefined
  send(stamped({ type: 'started' }))
  const timer = setInterval(
    () => send(stamped({ type: 'heartbeat', progress: work })),
    HEARTBEAT_MS,
  )
  return () => clearInterval(timer)
}
