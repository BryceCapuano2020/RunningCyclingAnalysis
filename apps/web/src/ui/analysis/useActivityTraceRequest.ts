import { useCallback } from 'react'
import type { ActivityTraceReply, WorkerResponse } from '../../worker/protocol'
import type { Account, Box } from './model'
import type { WorkerTransport } from './workerTransport'

/** Detail replies have their own shape and never replace the library's analysis state. */
export function activityTraceReply(message: WorkerResponse | null): ActivityTraceReply {
  return message?.type === 'activityTrace' ? message.reply : { kind: 'failed' }
}

/** Reads only the current account's cache; originals are downloaded after an explicit request. */
export function useActivityTraceRequest(
  send: WorkerTransport['send'],
  account: Box<Account>,
): (id: string, fromOriginal?: boolean) => Promise<ActivityTraceReply> {
  return useCallback(
    (id, fromOriginal = false) =>
      new Promise((resolve) => {
        const current = account.current
        const userId = current.status === 'signed-in' ? current.me?.user.id : undefined
        const sent = send(
          { type: 'activityTrace', id, fromOriginal, ...(userId ? { userId } : {}) },
          undefined,
          (message) => resolve(activityTraceReply(message)),
        )
        if (!sent) resolve({ kind: 'failed' })
      }),
    [send, account],
  )
}
