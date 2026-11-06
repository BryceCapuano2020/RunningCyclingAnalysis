import { createHarness } from './harness.ts'
import type { Bindings } from '../env.ts'

/** A valid set with synthetic values; `n` varies the set order and `over` any field. */
export function liftSet(n = 1, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: '2026-03-02',
    exercise: 'back-squat',
    equipment: 'barbell',
    setOrder: n,
    reps: 5,
    loadKg: 100,
    ...over,
  }
}

export const keyOf = (set: Record<string, unknown>): string =>
  `${String(set.date)}.${String(set.exercise)}.${String(set.equipment)}.${String(set.setOrder)}`

/** A signed-in account with the lift calls as functions. */
export async function liftAccount(email?: string, env: Partial<Bindings> = {}) {
  const h = createHarness({}, env)
  const cookies = { rca_session: await h.signIn(email) }
  const put = (sets: unknown[], insertOnly?: true) =>
    h.send({
      method: 'PUT',
      path: '/api/lifts',
      json: insertOnly ? { sets, insertOnly } : { sets },
      cookies,
    })
  const del = (keys: string[]) =>
    h.send({ method: 'POST', path: '/api/lifts/delete', json: { keys }, cookies })
  const page = (cursor?: string) =>
    h.send({
      path: cursor === undefined ? '/api/lifts' : `/api/lifts?cursor=${cursor}`,
      cookies,
    })
  const me = async () =>
    (await (await h.send({ path: '/api/me', cookies })).json()) as {
      user: { id: string }
      libraryRevision: string
      liftRevision: number
    }
  return { h, cookies, put, del, page, me }
}
