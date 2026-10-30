import { beforeEach, describe, expect, it } from 'vitest'
import { countingDb, createHarness, START, testEnv, type Harness } from '../test/harness.ts'

/**
 * The listing's queries must keep their plan with and without table statistics. This runs the real
 * route, takes the SQL it prepared, and asks SQLite for the plan before and after ANALYZE
 * (D1 has no statistics until someone runs it, and nobody has checked production).
 */

const PER_USER = 400

async function seedTwoUsers(h: Harness): Promise<{ token: string }> {
  const token = await h.signIn('rider@example.test')
  await h.signIn('bystander@example.test')
  const users = (
    await h.env.DB.prepare('SELECT id, email FROM users').all<{ id: string; email: string }>()
  ).results
  const statements: D1PreparedStatement[] = []
  for (const user of users) {
    for (let n = 0; n < PER_USER; n += 1) {
      const id = `${user.email.slice(0, 3)}-${String(n).padStart(4, '0')}`
      statements.push(
        h.env.DB.prepare(
          `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
             digest_json, file_name, file_hash, created_at)
           VALUES (?, ?, ?, 'run', ?, 'n', 1, '{"name":"n"}', 'f.fit', 'h', ?)`,
        ).bind(id, user.id, id, START + n, START + Math.floor(n / 3) * 1000),
      )
    }
  }
  for (let i = 0; i < statements.length; i += 100) {
    await h.env.DB.batch(statements.slice(i, i + 100))
  }
  return { token }
}

/** The SQL the listing prepared for its three kinds of read, from a first page, a next page and a since page. */
async function listingSql(h: Harness, db: ReturnType<typeof countingDb>, token: string) {
  const cookies = { rca_session: token }
  db.reset()
  const first = await h.send({ path: '/api/activities?limit=20', cookies })
  const cursor = ((await first.json()) as { nextCursor: string }).nextCursor
  await h.send({ path: `/api/activities?limit=20&cursor=${cursor}`, cookies })
  await h.send({ path: `/api/activities?limit=20&since=${START + 5000}`, cookies })
  const activities = db.statements().filter((sql) => /from "activities"/i.test(sql))
  const pick = (test: (sql: string) => boolean) => {
    const found = activities.filter(test)
    expect(found.length).toBeGreaterThan(0)
    return found
  }
  return {
    metadata: pick((sql) => /order by/i.test(sql)),
    pageRead: pick((sql) => / in \(/i.test(sql)),
  }
}

async function planOf(h: Harness, sql: string): Promise<string> {
  const placeholders = sql.match(/\?/g)?.length ?? 0
  const { results } = await h.env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...Array.from({ length: placeholders }, () => null))
    .all<{ detail: string }>()
  return results.map((row) => row.detail).join(' | ')
}

const IDS = Array.from({ length: 90 }, () => '?').join(', ')
const UNPINNED = `SELECT * FROM activities WHERE user_id = ? AND id IN (${IDS})`

async function expectPinnedPlans(analyze: boolean): Promise<Harness> {
  const db = countingDb(createHarness().env.DB)
  const h = createHarness({}, { DB: db.db })
  const { token } = await seedTwoUsers(h)
  if (analyze) await h.env.DB.prepare('ANALYZE').run()
  const sql = await listingSql(h, db, token)

  for (const metadata of sql.metadata) {
    const plan = await planOf(h, metadata)
    expect(plan).toContain('USING INDEX activities_user_created_id_idx (user_id=?')
    expect(plan).not.toContain('TEMP B-TREE')
    expect(plan).not.toContain('activities_user_created_idx ')
  }
  for (const pageRead of sql.pageRead) {
    const plan = await planOf(h, pageRead)
    expect(plan).toContain('USING INDEX sqlite_autoindex_activities_1 (id=?)')
    expect(plan).not.toContain('activities_user_created')
  }
  return h
}

// ANALYZE writes sqlite_stat1, which stays in this file's database and is not emptied between tests. Each test
// drops it first, so the statistics-free test sees none whichever order the tests run in.
describe('activity listing query plans', () => {
  beforeEach(async () => {
    await testEnv().DB.prepare('DROP TABLE IF EXISTS sqlite_stat1').run()
  })

  it('keep one index range and the primary key without statistics', async () => {
    const h = await expectPinnedPlans(false)
    // A control for the pin. The unpinned page read must reproduce the audit's plan on this SQLite,
    // or "the plan is fine" would hold for any query and the pin would prove nothing.
    expect(await planOf(h, UNPINNED)).toContain(
      'USING INDEX activities_user_created_idx (user_id=?)',
    )
  })

  it('keep the same plans after ANALYZE', async () => {
    const h = await expectPinnedPlans(true)
    expect(await planOf(h, UNPINNED)).toContain('sqlite_autoindex_activities_1 (id=?)')
  })
})
