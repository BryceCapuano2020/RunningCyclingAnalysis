import { LiftDeleteAnswerSchema, LiftPageAnswerSchema, LiftWriteAnswerSchema } from '@rca/contract'
import type { LiftSet } from '@rca/core/lift'
import { LiftTransportError } from '../worker/liftTransport'
import type { LiftPageAnswer, LiftPutAnswer, LiftTransport } from '../worker/liftTransport'
import { ApiRequestError, readJson, request } from './client'

/** An answer is a revision and at most 500 keys. */
const ANSWER_LIMIT = 64 * 1024
/** A page is at most 1,000 sets, about 220 KB. */
const PAGE_LIMIT = 512 * 1024

/** The kind a failed request counts as (liftTransport.ts says what each means for the engine). */
function failureOf(error: unknown): LiftTransportError {
  if (!(error instanceof ApiRequestError)) return new LiftTransportError('other', [], true)
  const { status } = error
  if (status === 400) return new LiftTransportError('invalid', error.refused ?? [])
  if (status === 401) return new LiftTransportError('unauthorized')
  if (status === 409 && error.code === 'lift_limit') return new LiftTransportError('cap')
  // Status 0 is no connection.
  // A body that breaks the contract is a version skew: trying again will not fix it.
  const transient =
    error.code !== 'invalid_response' && (status === 0 || status === 429 || status >= 500)
  return new LiftTransportError('other', [], transient)
}

async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    throw failureOf(error)
  }
}

/** The account's lift sets over GET /api/lifts, PUT /api/lifts and POST /api/lifts/delete. */
export function createLiftTransport(userId?: string): LiftTransport {
  return {
    put: (sets: readonly LiftSet[], options): Promise<LiftPutAnswer> =>
      guarded(async () => {
        const json = options?.insertOnly === true ? { sets, insertOnly: true } : { sets }
        const body = await readJson(
          await request('PUT', '/api/lifts', { json }, userId),
          LiftWriteAnswerSchema,
          ANSWER_LIMIT,
        )
        return { liftRevision: body.liftRevision, skipped: body.skipped }
      }),
    remove: (keys) =>
      guarded(async () => {
        const body = await readJson(
          await request('POST', '/api/lifts/delete', { json: { keys } }, userId),
          LiftDeleteAnswerSchema,
          ANSWER_LIMIT,
        )
        return { liftRevision: body.liftRevision }
      }),
    page: (cursor): Promise<LiftPageAnswer> =>
      guarded(async () => {
        const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
        return readJson(
          await request('GET', `/api/lifts${query}`, undefined, userId),
          LiftPageAnswerSchema,
          PAGE_LIMIT,
        )
      }),
  }
}
