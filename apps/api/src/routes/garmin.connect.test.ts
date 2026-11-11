import { describe, expect, it } from 'vitest'
import { createHarness, testEnv, type Harness } from '../test/harness.ts'
import { fakeGarmin, GARMIN_ON, type FakeGarmin, type FakeGarminOptions } from '../test/garmin.ts'
import { openTokens } from '../providers/tokens.ts'

/** docs/design/garmin-sync.md section 5a, the connect rows, against a fake Garmin. */

function garminHarness(options: FakeGarminOptions = {}, env: Record<string, string> = GARMIN_ON) {
  const garmin = fakeGarmin(options)
  const h = createHarness({ garmin: () => garmin }, env)
  return { h, garmin }
}

async function userIdOf(h: Harness, token: string): Promise<string> {
  const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
  return ((await me.json()) as { user: { id: string } }).user.id
}

/** The cookies a response sets, by name, with their values (an empty value is a clear). */
function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of res.headers.getSetCookie()) {
    const match = /^([^=]+)=([^;]*)/.exec(line)
    if (match) out[match[1]!] = match[2]!
  }
  return out
}

/** Starts a connect as `token` and returns the state Garmin is sent and the cookies to send back. */
async function connect(h: Harness, token: string) {
  const res = await h.send({ path: '/api/garmin/connect', cookies: { rca_session: token } })
  expect(res.status).toBe(302)
  const state = new URL(res.headers.get('location')!).searchParams.get('state')!
  return { state, cookies: setCookies(res) }
}

async function callback(
  h: Harness,
  session: string | undefined,
  flow: { state: string; cookies: Record<string, string> },
  query: Record<string, string> = {},
) {
  const params = new URLSearchParams({ state: flow.state, code: 'code-for-g-100', ...query })
  return h.send({
    path: `/api/garmin/callback?${params}`,
    cookies: { ...flow.cookies, ...(session === undefined ? {} : { rca_session: session }) },
  })
}

function outcome(res: Response): string | null {
  expect(res.status).toBe(302)
  const location = res.headers.get('location')!
  expect(location.startsWith('http://localhost:5183/#/profile?garmin=')).toBe(true)
  return new URL(location.replace('/#/', '/')).searchParams.get('garmin')
}

async function links() {
  const { results } = await testEnv()
    .DB.prepare('SELECT user_id, provider_user_id, key_id, token_ciphertext FROM provider_links')
    .all<{ user_id: string; provider_user_id: string; key_id: string; token_ciphertext: string }>()
  return results
}

describe('connecting Garmin', () => {
  it('is not there while GARMIN_ENABLED is off', async () => {
    const { h } = garminHarness({}, {})
    const token = await h.signIn()
    for (const path of ['/api/garmin/connect', '/api/garmin/callback?state=a&code=b']) {
      expect((await h.send({ path, cookies: { rca_session: token } })).status).toBe(404)
    }
  })

  it('needs a signed-in account', async () => {
    const { h } = garminHarness()
    expect((await h.send({ path: '/api/garmin/connect' })).status).toBe(401)
  })

  it('answers 503 when the flag is on without a valid token key', async () => {
    const { h } = garminHarness({}, { ...GARMIN_ON, PROVIDER_TOKEN_KEY: 'k1:short' })
    const token = await h.signIn()
    const res = await h.send({ path: '/api/garmin/connect', cookies: { rca_session: token } })
    expect(res.status).toBe(503)
  })

  it('links the account, with its tokens sealed under the current key', async () => {
    const { h, garmin } = garminHarness()
    const token = await h.signIn()
    const flow = await connect(h, token)
    expect(Object.keys(flow.cookies).sort()).toEqual(['rca_garmin_state', 'rca_garmin_verifier'])

    const res = await callback(h, token, flow)

    expect(outcome(res)).toBe('connected')
    expect(garmin.exchanges).toEqual([
      { code: 'code-for-g-100', codeVerifier: flow.cookies.rca_garmin_verifier },
    ])
    const [link] = await links()
    expect(link).toMatchObject({ provider_user_id: 'g-100', key_id: 't2' })
    expect(link!.token_ciphertext).not.toContain('access')
    const opened = await openTokens(GARMIN_ON.PROVIDER_TOKEN_KEY, link!.user_id, 'garmin', {
      ciphertext: link!.token_ciphertext,
      keyId: link!.key_id,
    })
    expect(opened).toMatchObject({ accessToken: 'access-g-100-1' })
    // The one-shot cookies are cleared, and no redirect carries a token.
    expect(setCookies(res)).toMatchObject({ rca_garmin_state: '', rca_garmin_verifier: '' })
    expect(res.headers.get('location')).not.toContain('access')
  })

  it.each([
    ['a state that does not match', { state: 'other' }, 'oauth_state_mismatch'],
    ['Garmin refusing', { error: 'access_denied' }, 'oauth_denied'],
  ])('stores nothing and exchanges no code for %s', async (_label, query, code) => {
    const { h, garmin } = garminHarness()
    const token = await h.signIn()
    const flow = await connect(h, token)
    const res = await callback(h, token, flow, query)
    expect(outcome(res)).toBe(code)
    expect(setCookies(res)).toMatchObject({ rca_garmin_state: '', rca_garmin_verifier: '' })
    expect(garmin.exchanges).toEqual([])
    expect(await links()).toEqual([])
  })

  it('reads a forged state cookie as a mismatch', async () => {
    const { h, garmin } = garminHarness()
    const token = await h.signIn()
    const flow = await connect(h, token)
    const forged = { ...flow, cookies: { ...flow.cookies, rca_garmin_state: `${flow.state}.a` } }
    expect(outcome(await callback(h, token, forged))).toBe('oauth_state_mismatch')
    expect(garmin.exchanges).toEqual([])
  })

  it('finishes only for the account that started it', async () => {
    const { h, garmin } = garminHarness()
    const flow = await connect(h, await h.signIn('first@example.test'))
    const other = await h.signIn('second@example.test')

    expect(outcome(await callback(h, other, flow))).toBe('oauth_state_mismatch')
    expect(outcome(await callback(h, undefined, flow))).toBe('unauthenticated')
    expect(garmin.exchanges).toEqual([])
    expect(await links()).toEqual([])
  })

  it('stores nothing when Garmin refuses the code', async () => {
    const { h } = garminHarness({ failExchange: true })
    const token = await h.signIn()
    expect(outcome(await callback(h, token, await connect(h, token)))).toBe('oauth_exchange_failed')
    expect(await links()).toEqual([])
  })

  it('refuses a Garmin account linked to another account, and keeps that link', async () => {
    const { h } = garminHarness({ garminUserId: 'g-shared' })
    const first = await h.signIn('first@example.test')
    expect(outcome(await callback(h, first, await connect(h, first)))).toBe('connected')
    const second = await h.signIn('second@example.test')

    expect(outcome(await callback(h, second, await connect(h, second)))).toBe(
      'garmin_linked_elsewhere',
    )
    const all = await links()
    expect(all.map((link) => link.user_id)).toEqual([await userIdOf(h, first)])
  })

  it('replaces the link on a reconnect, and deregisters the grant of a Garmin account left', async () => {
    const { h, garmin } = garminHarness()
    const token = await h.signIn()
    await callback(h, token, await connect(h, token), { code: 'code-for-g-1' })
    await callback(h, token, await connect(h, token), { code: 'code-for-g-1' })
    expect(garmin.deregistered).toEqual([])

    await callback(h, token, await connect(h, token), { code: 'code-for-g-2' })

    expect(garmin.deregistered).toEqual(['access-g-1-2'])
    expect((await links()).map((link) => link.provider_user_id)).toEqual(['g-2'])
  })

  it('stores nothing for an account that started deleting during the exchange', async () => {
    let fake: FakeGarmin | undefined
    const { h } = garminHarness()
    const token = await h.signIn()
    const userId = await userIdOf(h, token)
    const flow = await connect(h, token)
    fake = fakeGarmin()
    const exchange = fake.exchangeCode.bind(fake)
    fake.exchangeCode = async (code, verifier) => {
      await testEnv().DB.prepare('UPDATE users SET deleting_at = 1 WHERE id = ?').bind(userId).run()
      return exchange(code, verifier)
    }
    const racing = createHarness({ garmin: () => fake! }, GARMIN_ON)

    expect(outcome(await callback(racing, token, flow))).toBe('account_deleting')
    expect(await links()).toEqual([])
  })
})
