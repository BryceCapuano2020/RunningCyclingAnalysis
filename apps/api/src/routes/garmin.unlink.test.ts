import { describe, expect, it } from 'vitest'
import { createHarness, testEnv, type Harness } from '../test/harness.ts'
import { fakeGarmin, GARMIN_ON, type FakeGarminOptions } from '../test/garmin.ts'
import { inboxKey } from '../inbox/key.ts'
import { sealTokens } from '../providers/tokens.ts'

/** docs/design/garmin-sync.md section 5a, the rows that remove a link: disconnect, Garmin's notice, deletion. */

const ACCESS = 'access-synthetic-1'

function garminHarness(options: FakeGarminOptions = {}, env: Record<string, string> = GARMIN_ON) {
  const garmin = fakeGarmin(options)
  const h = createHarness({ garmin: () => garmin }, env)
  return { h, garmin }
}

async function userIdOf(h: Harness, token: string): Promise<string> {
  const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
  return ((await me.json()) as { user: { id: string } }).user.id
}

/** A linked account with one waiting inbox item and its file, as connect and a push (G4) leave it. */
async function linked(h: Harness, email = 'linked@example.test', garminUserId = 'g-7') {
  const token = await h.signIn(email)
  const userId = await userIdOf(h, token)
  const sealed = await sealTokens(
    GARMIN_ON.PROVIDER_TOKEN_KEY,
    (n) => crypto.getRandomValues(new Uint8Array(n)),
    userId,
    'garmin',
    { accessToken: ACCESS },
  )
  const key = inboxKey(userId, `item-${garminUserId}`)
  await h.env.FILES!.put(key, new Uint8Array([1]))
  await testEnv().DB.batch([
    testEnv()
      .DB.prepare(
        `INSERT INTO provider_links (user_id, provider, provider_user_id, token_ciphertext, key_id, scopes, linked_at)
         VALUES (?, 'garmin', ?, ?, ?, 'ACTIVITY_EXPORT', 1)`,
      )
      .bind(userId, garminUserId, sealed.ciphertext, sealed.keyId),
    testEnv()
      .DB.prepare(
        `INSERT INTO inbox_items (id, user_id, provider, provider_activity_id, file_key, file_size, received_at)
         VALUES (?, ?, 'garmin', 'a-1', ?, 1, 1)`,
      )
      .bind(`item-${garminUserId}`, userId, key),
  ])
  return { token, userId, key }
}

async function count(table: string): Promise<number> {
  const row = await testEnv()
    .DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>()
  return row!.n
}

function notice(h: Harness, body: unknown) {
  // Garmin's server sends it: no session and no CSRF header.
  return h.send({ method: 'POST', path: '/api/garmin/deregistration', json: body, csrf: false })
}

describe('disconnecting Garmin', () => {
  it('deregisters, then removes the link, the inbox and its files', async () => {
    const { h, garmin } = garminHarness()
    const { token, key } = await linked(h)

    const res = await h.send({
      method: 'DELETE',
      path: '/api/garmin',
      cookies: { rca_session: token },
    })

    expect(res.status).toBe(204)
    expect(garmin.deregistered).toEqual([ACCESS])
    expect(await count('provider_links')).toBe(0)
    expect(await count('inbox_items')).toBe(0)
    expect(await h.env.FILES!.head(key)).toBeNull()
  })

  it('removes the link when Garmin fails to deregister, and works with the flag off', async () => {
    const { h } = garminHarness({ failDeregister: true }, {})
    const { token } = await linked(h)
    const res = await h.send({
      method: 'DELETE',
      path: '/api/garmin',
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(204)
    expect(await count('provider_links')).toBe(0)
  })

  it('is a no-op for an account with no link', async () => {
    const { h, garmin } = garminHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'DELETE',
      path: '/api/garmin',
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(204)
    expect(garmin.deregistered).toEqual([])
  })
})

describe("Garmin's deregistration notice", () => {
  it('removes the link it names when it carries the link token, without calling Garmin', async () => {
    const { h, garmin } = garminHarness()
    const { key } = await linked(h)
    const res = await notice(h, { deregistrations: [{ userId: 'g-7', userAccessToken: ACCESS }] })
    expect(res.status).toBe(200)
    expect(await count('provider_links')).toBe(0)
    expect(await h.env.FILES!.head(key)).toBeNull()
    expect(garmin.deregistered).toEqual([])
  })

  it.each([
    ['a wrong token', { userId: 'g-7', userAccessToken: 'access-synthetic-2' }],
    ['a shorter token', { userId: 'g-7', userAccessToken: 'access' }],
    ['no token', { userId: 'g-7' }],
    ['an unknown user', { userId: 'g-unknown', userAccessToken: ACCESS }],
  ])('answers 200 and changes nothing for %s', async (_label, entry) => {
    const { h } = garminHarness()
    await linked(h)
    const res = await notice(h, { deregistrations: [entry] })
    expect(res.status).toBe(200)
    expect(await count('provider_links')).toBe(1)
    expect(await count('inbox_items')).toBe(1)
  })

  it('refuses a body that is not a notice', async () => {
    const { h } = garminHarness()
    expect((await notice(h, { deregistrations: 'all' })).status).toBe(400)
  })
})

describe('account deletion and the Garmin link', () => {
  it('deregisters with Garmin first, then deletes the link with the account', async () => {
    const { h, garmin } = garminHarness()
    const { token, key } = await linked(h)
    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(204)
    expect(garmin.deregistered).toEqual([ACCESS])
    expect(await count('provider_links')).toBe(0)
    expect(await h.env.FILES!.head(key)).toBeNull()
  })

  it('still deletes the account when Garmin fails to deregister', async () => {
    const { h } = garminHarness({ failDeregister: true })
    const { token } = await linked(h)
    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(204)
    expect(await count('users')).toBe(0)
  })
})
