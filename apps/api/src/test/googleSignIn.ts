import {
  createHarness,
  fakeGoogle,
  fakeIdToken,
  googleClaims,
  sessionCookie,
  type Harness,
} from './harness.ts'
import type { Bindings } from '../env.ts'

export interface GoogleHarness extends Harness {
  /** Runs the whole Google callback for an identity and returns its response. */
  signInAs(claims?: Record<string, unknown>): Promise<Response>
  /** Runs the callback, requires a session, and returns its cookie value. */
  sessionFor(claims?: Record<string, unknown>): Promise<string>
  /** Deletes the account the session belongs to. */
  deleteAccount(token: string): Promise<Response>
}

/** A harness whose Google stub returns whichever claims the next `signInAs` names. */
export function createGoogleHarness(envOverrides: Partial<Bindings> = {}): GoogleHarness {
  const current: { claims: Record<string, unknown> } = { claims: googleClaims() }
  const h = createHarness(
    { google: () => fakeGoogle({ idToken: fakeIdToken(current.claims) }) },
    envOverrides,
  )
  const signInAs = async (claims: Record<string, unknown> = {}) => {
    current.claims = googleClaims(claims)
    const start = await h.send({ path: '/api/auth/google' })
    const cookie = (name: string) => {
      const line = start.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
      return line?.slice(name.length + 1).split(';')[0] ?? ''
    }
    const state = cookie('rca_oauth_state')
    return h.send({
      path: `/api/auth/google/callback?state=${state}&code=code-1`,
      cookies: { rca_oauth_state: state, rca_oauth_verifier: cookie('rca_oauth_verifier') },
      // Google sends the browser to the callback, so a refusal is a redirect back to the app, not JSON.
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    })
  }
  return {
    ...h,
    signInAs,
    async sessionFor(claims) {
      const res = await signInAs(claims)
      const token = sessionCookie(res)
      if (res.status !== 302 || !token) throw new Error(`sign-in failed: ${res.status}`)
      return token
    },
    deleteAccount: (token) =>
      h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } }),
  }
}
