import { describe, expect, it } from 'vitest'
import { createHarness, START } from '../test/harness.ts'

const PROFILE = { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true }
const LIBRARY = 40

/**
 * Turning original files off clears the file columns. It must write only the rows that record a
 * file or a reservation, not every row of the library (twice, as it once did): a library of
 * thousands with a few originals would otherwise burn a day's write allowance per toggle.
 */
describe('PUT /api/profile turning original files off', () => {
  it('writes only the rows that record a file, and clears them', async () => {
    const h = createHarness()
    const token = await h.signIn()
    expect(
      (
        await h.send({
          method: 'PUT',
          path: '/api/profile',
          json: PROFILE,
          cookies: { rca_session: token },
        })
      ).status,
    ).toBe(200)
    const owner = await h.env.DB.prepare('SELECT id FROM users').first<{ id: string }>()
    const insert = h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
         digest_json, file_name, file_hash, created_at, file_key, file_size)
       VALUES (?1, ?2, ?3, 'run', ?4, 'Run', 1, '{}', 'a.fit', ?5, 1, ?6, ?7)`,
    )
    await h.env.DB.batch(
      Array.from({ length: LIBRARY }, (_, i) =>
        insert.bind(
          `a${i}`,
          owner!.id,
          `run-${i}`,
          START + i * 1000,
          `hash-${i}`,
          i < 2 ? `users/${owner!.id}/a${i}` : null,
          i < 2 ? 10 : null,
        ),
      ),
    )
    await h.env.DB.batch([
      h.env.DB.prepare('CREATE TABLE toggle_writes (id TEXT)'),
      h.env.DB.prepare(
        'CREATE TRIGGER toggle_count AFTER UPDATE OF file_key, file_size, file_reservation_token ON activities BEGIN INSERT INTO toggle_writes VALUES (new.id); END',
      ),
    ])
    try {
      const res = await h.send({
        method: 'PUT',
        path: '/api/profile',
        json: { ...PROFILE, keepFiles: false },
        cookies: { rca_session: token },
      })
      expect(res.status).toBe(200)
      const written = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM toggle_writes').first<{
        n: number
      }>()
      // Two rows had files; each is cleared once by the first pass, and the second pass finds none.
      expect(written?.n).toBe(2)
      const left = await h.env.DB.prepare(
        'SELECT COUNT(*) AS n FROM activities WHERE file_key IS NOT NULL OR file_size IS NOT NULL',
      ).first<{ n: number }>()
      expect(left?.n).toBe(0)
    } finally {
      await h.env.DB.batch([
        h.env.DB.prepare('DROP TRIGGER IF EXISTS toggle_count'),
        h.env.DB.prepare('DROP TABLE IF EXISTS toggle_writes'),
      ])
    }
  })
})
