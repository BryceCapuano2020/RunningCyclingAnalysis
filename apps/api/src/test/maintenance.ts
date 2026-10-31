import { ORPHAN_GRACE_MS } from '../maintenance.ts'
import { systemDeps } from '../deps.ts'
import { sha256Hex } from '../util.ts'
import { digestFixture, START, testEnv, type Harness } from './harness.ts'

const HOUR = 60 * 60 * 1000

/** An hour past the orphan grace period for an object put at START. */
export const AFTER_GRACE = START + ORPHAN_GRACE_MS + HOUR
export const R2_CALLS = new Set(['list', 'delete', 'head', 'get', 'put'])

export function at(now: number) {
  return { ...systemDeps, now: () => now }
}

export async function signedInUser(
  h: Harness,
  email: string,
): Promise<{ token: string; uid: string }> {
  const token = await h.signIn(email)
  const me = (await (
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
  ).json()) as {
    user: { id: string }
  }
  await h.send({
    method: 'PUT',
    path: '/api/profile',
    json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
    cookies: { rca_session: token },
  })
  return { token, uid: me.user.id }
}

export async function addActivity(h: Harness, token: string, startMs: number): Promise<string> {
  const created = (await (
    await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ startMs }),
        fileName: `ride-${startMs}.fit`,
        fileHash: await sha256Hex(new TextEncoder().encode(String(startMs))),
      },
      cookies: { rca_session: token },
    })
  ).json()) as { id: string }
  return created.id
}

export async function countOf(sql: string, ...values: unknown[]): Promise<number> {
  const row = await testEnv()
    .DB.prepare(sql)
    .bind(...values)
    .first<{ n: number }>()
  return row?.n ?? 0
}
