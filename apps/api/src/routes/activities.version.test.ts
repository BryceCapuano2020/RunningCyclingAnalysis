import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { describe, expect, it } from 'vitest'
import { START, createHarness, digestFixture } from '../test/harness.ts'
import { seedActivityRow } from '../test/seed.ts'

const HASH = 'd'.repeat(64)

/** The account's change counter, as the database holds it and as /api/me reports it. */
async function versions(h: ReturnType<typeof createHarness>, token: string, userId: string) {
  const row = await h.env.DB.prepare('SELECT library_version AS v FROM users WHERE id = ?')
    .bind(userId)
    .first<{ v: number }>()
  const me = (await (
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
  ).json()) as { libraryVersion: number }
  expect(me.libraryVersion).toBe(row!.v)
  return row!.v
}

describe('the library version (users.library_version)', () => {
  it('rises once for a create, a digest upgrade, a label and a delete, and not for a write that changed nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const cookies = { rca_session: token }
    const me = (await (await h.send({ path: '/api/me', cookies })).json()) as {
      user: { id: string }
    }
    const userId = me.user.id
    const id = await seedActivityRow(h.env.DB, { userId, revision: 1, fileHash: HASH })
    let seen = await versions(h, token, userId)

    // An upgrade of the stored digest by a newer model revision.
    const upgrade = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ modelRevision: MODEL_REVISION, name: 'renamed' }),
        fileName: 'ride.fit',
        fileHash: HASH,
      },
      cookies,
    })
    expect(upgrade.status).toBe(200)
    expect(await versions(h, token, userId)).toBe(seen + 1)
    seen += 1

    // The same upgrade again changes nothing, so nothing is counted.
    const again = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ modelRevision: MODEL_REVISION, name: 'renamed' }),
        fileName: 'ride.fit',
        fileHash: HASH,
      },
      cookies,
    })
    expect(again.status).toBe(200)
    expect(await versions(h, token, userId)).toBe(seen)

    // A label set in place, then the same claim again (a miss).
    const change = { id, revision: MODEL_REVISION, from: null, athleteType: 'walk' }
    const label = () =>
      h.send({
        method: 'PATCH',
        path: '/api/activities/labels',
        json: { labels: [change] },
        cookies,
      })
    expect(((await (await label()).json()) as { applied: number }).applied).toBe(1)
    expect(await versions(h, token, userId)).toBe(seen + 1)
    seen += 1
    expect(((await (await label()).json()) as { applied: number }).applied).toBe(0)
    expect(await versions(h, token, userId)).toBe(seen)

    // A new activity, and the delete of one.
    const created = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ startMs: START + 86_400_000 }),
        fileName: 'b.fit',
        fileHash: 'e'.repeat(64),
      },
      cookies,
    })
    expect(created.status).toBe(201)
    expect(await versions(h, token, userId)).toBe(seen + 1)
    seen += 1
    expect(
      (await h.send({ method: 'DELETE', path: `/api/activities/${id}`, cookies })).status,
    ).toBe(204)
    expect(await versions(h, token, userId)).toBe(seen + 1)
  })
})
