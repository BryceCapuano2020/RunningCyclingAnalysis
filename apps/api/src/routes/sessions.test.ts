import { MAX_SESSIONS_PER_USER, SessionListSchema, SessionRevokeSchema } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { createHarness, type Harness } from '../test/harness.ts'

/** Rows T1-T8 of the session table in .claude/stage-d/D3_DESIGN.md. */

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

describe('GET /api/sessions', () => {
  it("T3: lists this account's sessions newest first, marking the one asking, with no ids", async () => {
    const h = createHarness()
    const first = await signInAgain(h)
    const second = await signInAgain(h)
    await signInAgain(h, 'other@example.test')
    const res = await h.send({ path: '/api/sessions', ...asUser(first) })
    expect(res.status).toBe(200)
    const body = SessionListSchema.parse(await res.json())
    expect(body.sessions).toHaveLength(2)
    expect(body.sessions.map((s) => s.current)).toEqual([false, true])
    expect(body.sessions[0]?.createdAt).toBeGreaterThan(body.sessions[1]?.createdAt ?? 0)
    expect(Object.keys(body.sessions[0] ?? {}).sort()).toEqual([
      'createdAt',
      'current',
      'expiresAt',
    ])
    const fromSecond = SessionListSchema.parse(
      await (await h.send({ path: '/api/sessions', ...asUser(second) })).json(),
    )
    expect(fromSecond.sessions.map((s) => s.current)).toEqual([true, false])
  })

  it('T8: needs a session', async () => {
    const h = createHarness()
    expect((await h.send({ path: '/api/sessions' })).status).toBe(401)
    expect((await h.send({ method: 'DELETE', path: '/api/sessions' })).status).toBe(401)
  })
})

describe('DELETE /api/sessions', () => {
  it('T4: ends every session of the account, this one too, and clears the cookie', async () => {
    const h = createHarness()
    const tokens = [await signInAgain(h), await signInAgain(h), await signInAgain(h)]
    const bystander = await signInAgain(h, 'other@example.test')
    const res = await h.send({
      method: 'DELETE',
      path: '/api/sessions',
      ...asUser(tokens[0] ?? ''),
    })
    expect(res.status).toBe(200)
    expect(SessionRevokeSchema.parse(await res.json())).toEqual({ revoked: 3 })
    expect(
      res.headers
        .getSetCookie()
        .some((c) => c.startsWith('rca_session=;') || c.includes('Max-Age=0')),
    ).toBe(true)
    for (const token of tokens) expect(await isSignedIn(h, token), 'revoked').toBe(false)
    expect(await sessionCount(h)).toBe(0)
    expect(await isSignedIn(h, bystander)).toBe(true)
  })

  it('T5: keep=current ends only the other sessions', async () => {
    const h = createHarness()
    const tokens = [await signInAgain(h), await signInAgain(h), await signInAgain(h)]
    const res = await h.send({
      method: 'DELETE',
      path: '/api/sessions?keep=current',
      ...asUser(tokens[1] ?? ''),
    })
    expect(SessionRevokeSchema.parse(await res.json())).toEqual({ revoked: 2 })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('rca_session=;'))).toBe(false)
    expect(await isSignedIn(h, tokens[1] ?? '')).toBe(true)
    expect(await isSignedIn(h, tokens[0] ?? '')).toBe(false)
    expect(await isSignedIn(h, tokens[2] ?? '')).toBe(false)
  })

  it("T6: a revoked session's cookie is answered as signed out", async () => {
    const h = createHarness()
    const old = await signInAgain(h)
    const current = await signInAgain(h)
    await h.send({ method: 'DELETE', path: '/api/sessions?keep=current', ...asUser(current) })
    const res = await h.send({ path: '/api/activities', ...asUser(old) })
    expect(res.status).toBe(401)
  })

  it('T7: deleting the account takes its sessions with it', async () => {
    const h = createHarness()
    const token = await signInAgain(h)
    await signInAgain(h)
    await h.send({ method: 'DELETE', path: '/api/me', ...asUser(token) })
    expect(await sessionCount(h)).toBe(0)
  })

  it('refuses a request without the client header, and any other keep value', async () => {
    const h = createHarness()
    const token = await signInAgain(h)
    const noHeader = await h.send({
      method: 'DELETE',
      path: '/api/sessions',
      csrf: false,
      ...asUser(token),
    })
    expect(noHeader.status).toBe(403)
    const bad = await h.send({ method: 'DELETE', path: '/api/sessions?keep=all', ...asUser(token) })
    expect(bad.status).toBe(400)
    expect(await sessionCount(h)).toBe(1)
  })
})
