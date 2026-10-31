import { useCallback } from 'react'
import { replyOf } from '../routeReply'
import type { RouteReply } from '../routeReply'
import type { Account, Box } from './model'
import type { WorkerTransport } from './workerTransport'

/** Asks the worker for a saved activity's route, under the signed-in account when there is one. */
export function useRouteRequest(
  send: WorkerTransport['send'],
  account: Box<Account>,
): (id: string, fromOriginal: boolean) => Promise<RouteReply> {
  return useCallback(
    (id, fromOriginal) =>
      new Promise<RouteReply>((resolve) => {
        const { status, me } = account.current
        const userId = status === 'signed-in' ? me?.user.id : undefined
        send(
          { type: 'routeShape', id, fromOriginal, ...(userId === undefined ? {} : { userId }) },
          undefined,
          (message) => resolve(replyOf(message)),
        )
      }),
    [send, account],
  )
}
