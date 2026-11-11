import { MAX_SESSIONS_PER_USER } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { createHarness, type Harness } from '../test/harness.ts'

/** Rows T1-T8 of the session table: the ten-session cap and account deletion (auth/session.ts, accountDeletion.ts). */

async function signInAgain(h: Harness, email = 'rider@example.test'): Promise<string> {
  h.clock.now += 1000
  return h.signIn(email)
}

const asUser = (token: string) => ({ cookies: { rca_session: token } })

async function sessionCount(h: Harness, email = 'rider@example.test'): Promise<number> {
  const row = await h.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)',
  )
    .bind(email)
    .first<{ n: number }>()
  return row?.n ?? 0
}

async function isSignedIn(h: Harness, token: string): Promise<boolean> {
  const res = await h.send({ path: '/api/me', ...asUser(token) })
  return (await res.json()) !== null
}

describe('session cap', () => {
  it('T1: sign-ins below the cap all stay valid', async () => {
    const h = createHarness()
    const tokens = []
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i += 1) tokens.push(await signInAgain(h))
    expect(await sessionCount(h)).toBe(MAX_SESSIONS_PER_USER)
    for (const token of tokens) expect(await isSignedIn(h, token)).toBe(true)
  })

  it('T2: the sign-in over the cap ends the oldest session and keeps the new one', async () => {
    const h = createHarness()
    const tokens = []
    for (let i = 0; i < MAX_SESSIONS_PER_USER + 1; i += 1) tokens.push(await signInAgain(h))
    expect(await sessionCount(h)).toBe(MAX_SESSIONS_PER_USER)
    expect(await isSignedIn(h, tokens[0] ?? '')).toBe(false)
    for (const token of tokens.slice(1)) expect(await isSignedIn(h, token)).toBe(true)
  })

  it('T2: many sign-ins at once still leave exactly the cap, and never touch another user', async () => {
    const h = createHarness()
    const other = await h.signIn('other@example.test')
    await h.signIn('rider@example.test')
    await Promise.all(Array.from({ length: 25 }, () => h.signIn('rider@example.test')))
    expect(await sessionCount(h)).toBe(MAX_SESSIONS_PER_USER)
    expect(await sessionCount(h, 'other@example.test')).toBe(1)
    expect(await isSignedIn(h, other)).toBe(true)
  })
})

describe('session lifetime', () => {
  it('T7: deleting the account takes its sessions with it', async () => {
    const h = createHarness()
    const token = await signInAgain(h)
    await signInAgain(h)
    await h.send({ method: 'DELETE', path: '/api/me', ...asUser(token) })
    expect(await sessionCount(h)).toBe(0)
  })
})
