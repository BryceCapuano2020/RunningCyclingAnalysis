import { DATABASE_SOFT_LIMIT_BYTES } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { createHarness, digestFixture, testEnv } from '../test/harness.ts'

describe('DELETE /api/me without original-file storage', () => {
  it('deletes an account whose activities have no file fields', async () => {
    const h = createHarness({}, { FILES: undefined })
    const token = await h.signIn()
    await h.send({
      method: 'POST',
      path: '/api/activities',
      json: { digest: digestFixture(), fileName: 'a.fit', fileHash: 'a'.repeat(64) },
      cookies: { rca_session: token },
    })
    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(204)
  })

  it.each([
    ['a file key', "file_key = 'users/x/a'", 'file_size = NULL'],
    ['a file size', 'file_key = NULL', 'file_size = 1234'],
  ])('refuses to delete while an activity still records %s', async (_label, keySql, sizeSql) => {
    const h = createHarness({}, { FILES: undefined })
    const token = await h.signIn()
    const created = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: { digest: digestFixture(), fileName: 'a.fit', fileHash: 'a'.repeat(64) },
      cookies: { rca_session: token },
    })
    const { id } = (await created.json()) as { id: string }
    await testEnv()
      .DB.prepare(`UPDATE activities SET ${keySql}, ${sizeSql} WHERE id = ?`)
      .bind(id)
      .run()

    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'file_storage_unavailable' } })
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(me.status).toBe(200)
  })

  it('records the database size once the deletion completes, so creates are admitted again', async () => {
    const h = createHarness({}, { FILES: undefined })
    const leaving = await h.signIn('leaving@example.com')
    await testEnv()
      .DB.prepare(
        `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations,
           monthly_put_bytes, d1_size_bytes) VALUES (1, 0, '2026-01', 0, 0, ?)
         ON CONFLICT(id) DO UPDATE SET d1_size_bytes = excluded.d1_size_bytes`,
      )
      .bind(DATABASE_SOFT_LIMIT_BYTES + 1)
      .run()
    const res = await h.send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: leaving },
    })
    expect(res.status).toBe(204)

    const next = await h.signIn('next@example.com')
    const created = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: { digest: digestFixture(), fileName: 'a.fit', fileHash: 'a'.repeat(64) },
      cookies: { rca_session: next },
    })
    expect(created.status).toBe(201)
  })
})
