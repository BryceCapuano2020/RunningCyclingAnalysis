import type { Account, Box, Pending } from './model'
import type { WorkerTransport } from './workerTransport'

/**
 * A library read sent before the last Start over or sign-in. The clear that followed it empties the
 * page, so its state is not shown and it sets no hint.
 */
export function isOvertaken(
  transport: Pick<WorkerTransport, 'sessionEpochRef'>,
  pending: Pending,
): boolean {
  return (
    (pending.kind === 'loadServer' || pending.kind === 'loadDevice') &&
    pending.session !== transport.sessionEpochRef.current
  )
}

/** The requests whose answer lists the library kept in this browser. */
const DEVICE_LIST_KINDS = new Set<Pending['kind']>([
  'loadDevice',
  'keepProvisional',
  'deleteDeviceActivity',
])

/**
 * Whether the list of activities kept in this browser, posted ahead of the reply to the request it ran
 * under (`during`; the oldest request waiting when it names none), should be dropped: that request was overtaken by a Start over or a sign-in, or the page is
 * signed in, where the browser's own library is never listed. The account's own list, posted for a
 * library load, is never dropped, even when a Start over overtook the load.
 */
export function isStaleDeviceList(
  transport: Pick<WorkerTransport, 'pendingRepliesRef' | 'sessionEpochRef'>,
  accountRef: Box<Account>,
  during?: number,
): boolean {
  const waiting = transport.pendingRepliesRef.current
  const front = during === undefined ? waiting[0] : waiting.find(({ id }) => id === during)
  if (front === undefined || !DEVICE_LIST_KINDS.has(front.kind)) return false
  return isOvertaken(transport, front) || accountRef.current.status === 'signed-in'
}
