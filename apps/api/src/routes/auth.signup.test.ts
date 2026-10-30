import { MAX_ACCOUNT_CREATES_PER_DAY } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { utcDay } from '../budget.ts'
import { createGoogleHarness } from '../test/googleSignIn.ts'
import { sessionCookie, START } from '../test/harness.ts'

/**
 * One test per row of the sign-in and deletion tables in .claude/stage-d/D3_DESIGN.md (S1-S12, D1-D6).
 * Addresses are synthetic, on example.test.
 */
const LISTED = 'listed@example.test'
const OTHER = 'other@example.test'
const DAY_MS = 24 * 60 * 60 * 1000

type Row = Record<string, unknown>

async function rows(h: { env: { DB: D1Database } }, sql: string, ...binds: unknown[]) {
  const { results } = await h.env.DB.prepare(sql)
    .bind(...binds)
    .all<Row>()
  return results
}

const count = async (h: { env: { DB: D1Database } }, table: string) =>
  ((await rows(h, `SELECT COUNT(*) AS n FROM ${table}`))[0] as { n: number }).n

function listed(...emails: string[]) {
  return createGoogleHarness({ ALLOWED_EMAILS: emails.join(',') })
}

/** The refusal is a redirect back to the app carrying only the error's code, which the app words. */
function expectRefusal(res: Response, code: string, appUrl = 'http://localhost:5183'): void {
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe(`${appUrl}/#/?signin=${code}`)
  expect(sessionCookie(res)).toBeUndefined()
}

describe('sign-in with a sign-up list', () => {
  it('S1: an account that exists signs in whatever the list holds, including no list in production', async () => {
    const h = listed(LISTED)
    await h.sessionFor({ email: LISTED })

    h.env.ALLOWED_EMAILS = OTHER
    expect((await h.signInAs({ email: LISTED })).status).toBe(302)
    h.env.ALLOWED_EMAILS = undefined
    h.env.ENVIRONMENT = 'production'
    const res = await h.signInAs({ email: LISTED })
    expect(res.status).toBe(302)
    expect(sessionCookie(res)).toBeTruthy()
    expect(await count(h, 'users')).toBe(1)
  })

  it('S12: removing an address from the list does not sign its account out', async () => {
    const h = listed(LISTED)
    await h.sessionFor({ email: LISTED })
    h.env.ALLOWED_EMAILS = OTHER
    const res = await h.signInAs({ email: LISTED })
    expect(res.status).toBe(302)
    expect(await count(h, 'users')).toBe(1)
  })

  it('S2: an account being deleted is sent back to the app with its code, and no session is made', async () => {
    const h = listed(LISTED)
    await h.sessionFor({ email: LISTED })
    await h.env.DB.prepare('UPDATE users SET deleting_at = 1').run()
    const before = await count(h, 'sessions')
    const res = await h.signInAs({ email: LISTED })
    expectRefusal(res, 'account_deleting')
    expect(await count(h, 'sessions')).toBe(before)
  })

  it('S3: a user row with the email and no Google identity is linked, with no list needed', async () => {
    const h = createGoogleHarness({ ENVIRONMENT: 'production', ALLOWED_EMAILS: undefined })
    await h.env.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)')
      .bind('legacy-user', LISTED, 'Legacy', START)
      .run()
    const res = await h.signInAs({ email: LISTED, sub: 'sub-legacy' })
    expect(res.status).toBe(302)
    expect(await rows(h, 'SELECT user_id, provider_user_id FROM oauth_accounts')).toEqual([
      { user_id: 'legacy-user', provider_user_id: 'sub-legacy' },
    ])
    expect(await count(h, 'users')).toBe(1)
  })

  it('S4: an email already linked to another Google identity is sent back to the app with its code', async () => {
    const h = listed(LISTED)
    await h.sessionFor({ email: LISTED, sub: 'sub-first' })
    const res = await h.signInAs({ email: LISTED, sub: 'sub-second' })
    expectRefusal(res, 'account_conflict')
    expect(await rows(h, 'SELECT provider_user_id FROM oauth_accounts')).toEqual([
      { provider_user_id: 'sub-first' },
    ])
  })

  it('S5: a deleting user row with the email and no identity is refused before anything is linked', async () => {
    const h = listed(LISTED)
    await h.env.DB.prepare(
      'INSERT INTO users (id, email, name, created_at, deleting_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('going', LISTED, 'Going', START, START)
      .run()
    const res = await h.signInAs({ email: LISTED })
    expectRefusal(res, 'account_deleting')
    expect(await count(h, 'oauth_accounts')).toBe(0)
  })

  it('S6: a listed address creates the account, its link and a session, case-insensitively', async () => {
    const h = createGoogleHarness({ ALLOWED_EMAILS: ` ${OTHER} , ${LISTED.toUpperCase()} ,,` })
    const res = await h.signInAs({ email: 'Listed@Example.Test' })
    expect(res.status).toBe(302)
    expect(sessionCookie(res)).toBeTruthy()
    expect(await rows(h, 'SELECT email FROM users')).toEqual([{ email: LISTED }])
    expect(await count(h, 'oauth_accounts')).toBe(1)
    expect(await count(h, 'profiles')).toBe(1)
    expect(await count(h, 'sessions')).toBe(1)
  })

  it('S7: an address not on the list is sent back to the app with its code, and nothing is written', async () => {
    const h = listed(LISTED)
    const res = await h.signInAs({ email: OTHER })
    expectRefusal(res, 'not_on_list')
    // Only the code travels: the address the person used is not echoed anywhere.
    expect(res.headers.get('location')).not.toContain(OTHER)
    expect(await res.text()).toBe('')
    for (const table of ['users', 'oauth_accounts', 'sessions', 'profiles', 'identity_budget']) {
      expect(await count(h, table), table).toBe(0)
    }
  })

  it('S7: with no list, sign-up is refused in production and open in local development', async () => {
    const closed = createGoogleHarness({ ENVIRONMENT: 'production', ALLOWED_EMAILS: undefined })
    expectRefusal(await closed.signInAs({ email: LISTED }), 'not_on_list')
    expect(await count(closed, 'users')).toBe(0)

    const blank = createGoogleHarness({ ENVIRONMENT: 'production', ALLOWED_EMAILS: ' , ,' })
    expectRefusal(await blank.signInAs({ email: LISTED }), 'not_on_list')

    const dev = createGoogleHarness({ ALLOWED_EMAILS: undefined })
    expect((await dev.signInAs({ email: LISTED })).status).toBe(302)
  })

  it('S7: a list does not open sign-up to a public host that claims to be development', async () => {
    const h = createGoogleHarness({
      ENVIRONMENT: 'development',
      APP_URL: 'https://app.example.test',
    })
    h.env.ALLOWED_EMAILS = undefined
    expectRefusal(await h.signInAs({ email: LISTED }), 'not_on_list', 'https://app.example.test')
  })

  it('S8: an identity that created and deleted accounts up to the cap is sent back to the app with its code', async () => {
    const h = listed(LISTED)
    for (let i = 0; i < MAX_ACCOUNT_CREATES_PER_DAY; i += 1) {
      const token = await h.sessionFor({ email: LISTED })
      expect((await h.deleteAccount(token)).status).toBe(204)
    }
    const res = await h.signInAs({ email: LISTED })
    expectRefusal(res, 'signup_limit')
    expect(await count(h, 'users')).toBe(0)

    // Another identity is not affected, and the next UTC day starts the count again.
    expect((await h.signInAs({ email: LISTED, sub: 'sub-2' })).status).toBe(302)
    h.clock.now += DAY_MS
    h.env.ALLOWED_EMAILS = `${LISTED},${OTHER}`
    const tomorrow = await h.signInAs({ email: OTHER, exp: (h.clock.now + 3_600_000) / 1000 })
    expect(tomorrow.status).toBe(302)
  })

  it('S9: two callbacks for one new identity at once leave one user, one link, one counted creation', async () => {
    const h = listed(LISTED)
    const [a, b] = await Promise.all([h.signInAs({ email: LISTED }), h.signInAs({ email: LISTED })])
    expect([a.status, b.status]).toEqual([302, 302])
    expect(await count(h, 'users')).toBe(1)
    expect(await count(h, 'oauth_accounts')).toBe(1)
    expect(await count(h, 'sessions')).toBe(2)
    expect(
      await rows(h, "SELECT used FROM identity_budget WHERE action = 'accountCreate'"),
    ).toEqual([{ used: 1 }])
  })

  it("S10/D1/D4: deleting and signing in again the same day keeps the day's counts", async () => {
    const h = listed(LISTED)
    const token = await h.sessionFor({ email: LISTED })
    const first = (await rows(h, 'SELECT id FROM users'))[0] as { id: string }
    const day = utcDay(START)
    await h.env.DB.batch([
      h.env.DB.prepare(
        'INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)',
      ).bind(first.id, day, 'activityCreate', 7),
      h.env.DB.prepare(
        'INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)',
      ).bind(first.id, day, 'fileUpload', 3),
      h.env.DB.prepare(
        'INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)',
      ).bind(first.id, '2000-01-01', 'fileUpload', 9),
    ])
    expect((await h.deleteAccount(token)).status).toBe(204)
    expect(await count(h, 'daily_budget')).toBe(0)
    expect(
      await rows(
        h,
        "SELECT action, used FROM identity_budget WHERE action <> 'accountCreate' ORDER BY action",
      ),
    ).toEqual([
      { action: 'activityCreate', used: 7 },
      { action: 'fileUpload', used: 3 },
    ])

    expect((await h.signInAs({ email: LISTED })).status).toBe(302)
    const second = (await rows(h, 'SELECT id FROM users'))[0] as { id: string }
    expect(second.id).not.toBe(first.id)
    expect(
      await rows(
        h,
        'SELECT action, used FROM daily_budget WHERE user_id = ? ORDER BY action',
        second.id,
      ),
    ).toEqual([
      { action: 'activityCreate', used: 7 },
      { action: 'fileUpload', used: 3 },
    ])
    expect(
      await rows(h, "SELECT used FROM identity_budget WHERE action = 'accountCreate'"),
    ).toEqual([{ used: 2 }])
  })

  it('D5: the next UTC day starts from zero, as it does for an account never deleted', async () => {
    const h = listed(LISTED)
    const token = await h.sessionFor({ email: LISTED })
    const first = (await rows(h, 'SELECT id FROM users'))[0] as { id: string }
    await h.env.DB.prepare(
      'INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)',
    )
      .bind(first.id, utcDay(START), 'activityCreate', 7)
      .run()
    await h.deleteAccount(token)
    h.clock.now += DAY_MS
    await h.signInAs({ email: LISTED, exp: (h.clock.now + 3_600_000) / 1000 })
    expect(await count(h, 'daily_budget')).toBe(0)
  })

  it('S11: after deleting the account, an address no longer on the list cannot come back', async () => {
    const h = listed(LISTED)
    const token = await h.sessionFor({ email: LISTED })
    await h.deleteAccount(token)
    h.env.ALLOWED_EMAILS = OTHER
    expectRefusal(await h.signInAs({ email: LISTED }), 'not_on_list')
    expect(await count(h, 'users')).toBe(0)
    h.env.ALLOWED_EMAILS = undefined
    h.env.ENVIRONMENT = 'production'
    expectRefusal(await h.signInAs({ email: LISTED }), 'not_on_list')
  })

  it('D2: an account without a Google identity is deleted without saving any counts', async () => {
    const h = listed(LISTED)
    const token = await h.signIn('dev@example.test')
    await h.env.DB.prepare(
      "INSERT INTO daily_budget (user_id, day, action, used) SELECT id, ?, 'fileUpload', 2 FROM users",
    )
      .bind(utcDay(START))
      .run()
    expect((await h.deleteAccount(token)).status).toBe(204)
    expect(await count(h, 'identity_budget')).toBe(0)
    expect(await count(h, 'users')).toBe(0)
  })

  it('D1: the saved counts are keyed by a code, never by the Google subject or the email', async () => {
    const h = listed(LISTED)
    const token = await h.sessionFor({ email: LISTED, sub: 'sub-secret-value' })
    await h.deleteAccount(token)
    const dump = JSON.stringify(await rows(h, 'SELECT * FROM identity_budget'))
    expect(dump).not.toContain('sub-secret-value')
    expect(dump).not.toContain(LISTED)
    const keys = await rows(h, 'SELECT DISTINCT identity_key FROM identity_budget')
    expect(keys).toHaveLength(1)
    expect(keys[0]?.identity_key).toMatch(/^[0-9a-f]{64}$/)
  })
})
