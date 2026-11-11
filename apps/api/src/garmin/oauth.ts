import { z } from 'zod'
import type { Bindings } from '../env.ts'
import { pkceChallenge } from '../auth/google.ts'

/*
 * Garmin's OAuth 2.0 with PKCE (docs/design/garmin-sync.md section 5). The endpoints below are the ones Garmin's
 * Connect developer pages named for OAuth 2.0 before the October 2026 relaunch; section 9 asks Garmin to confirm them,
 * the scopes and the deregistration call. Nothing reaches them while GARMIN_ENABLED is off, and every test uses the
 * fake in test/garmin.ts.
 */
const AUTH_ENDPOINT = 'https://connect.garmin.com/oauth2Confirm'
const TOKEN_ENDPOINT = 'https://diauth.garmin.com/di-oauth2-service/oauth/token'
const USER_ID_ENDPOINT = 'https://apis.garmin.com/wellness-api/rest/user/id'
const REGISTRATION_ENDPOINT = 'https://apis.garmin.com/wellness-api/rest/user/registration'
/** A token or user-id call; a deregistration gets less, as it runs inside a deletion. */
const EXCHANGE_TIMEOUT_MS = 10_000
export const DEREGISTER_TIMEOUT_MS = 5_000

/** What the link keeps sealed. Garmin's refresh rules are section 9's question 5; G4 refreshes. */
export interface GarminTokens {
  accessToken: string
  refreshToken?: string
  /** Epoch milliseconds the access token stops working, when Garmin says. */
  expiresAt?: number
}

export interface GarminGrant {
  garminUserId: string
  tokens: GarminTokens
  scopes: string[]
}

export interface GarminOAuth {
  authorizationUrl(state: string, codeVerifier: string): Promise<URL>
  /** Exchanges the code and reads the Garmin user id the grant is for. Throws on any failure. */
  exchangeCode(code: string, codeVerifier: string): Promise<GarminGrant>
  /** Asks Garmin to stop sending this user's data and revoke the grant. Throws on failure. */
  deregister(accessToken: string): Promise<void>
}

export function garminRedirectUri(env: Pick<Bindings, 'APP_URL'>): string {
  return `${env.APP_URL}/api/garmin/callback`
}

const tokenSchema = z.object({
  access_token: z.string().min(1).max(4096),
  refresh_token: z.string().min(1).max(4096).optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().max(1024).optional(),
})
const userIdSchema = z.object({ userId: z.string().min(1).max(128) })

export function createGarminOAuth(env: Bindings): GarminOAuth {
  const clientId = env.GARMIN_CLIENT_ID ?? ''
  const redirectUri = garminRedirectUri(env)
  return {
    async authorizationUrl(state, codeVerifier) {
      const url = new URL(AUTH_ENDPOINT)
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: await pkceChallenge(codeVerifier),
        code_challenge_method: 'S256',
      }).toString()
      return url
    },
    async exchangeCode(code, codeVerifier) {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: env.GARMIN_CLIENT_SECRET ?? '',
          code_verifier: codeVerifier,
        }),
      })
      if (!response.ok) throw new Error(`Garmin token endpoint returned ${response.status}`)
      const token = tokenSchema.parse(await response.json())
      const who = await fetch(USER_ID_ENDPOINT, {
        signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
        headers: { authorization: `Bearer ${token.access_token}` },
      })
      if (!who.ok) throw new Error(`Garmin user id endpoint returned ${who.status}`)
      return {
        garminUserId: userIdSchema.parse(await who.json()).userId,
        tokens: {
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt:
            token.expires_in === undefined ? undefined : Date.now() + token.expires_in * 1000,
        },
        scopes: (token.scope ?? '').split(/\s+/).filter((scope) => scope !== ''),
      }
    },
    async deregister(accessToken) {
      const response = await fetch(REGISTRATION_ENDPOINT, {
        method: 'DELETE',
        signal: AbortSignal.timeout(DEREGISTER_TIMEOUT_MS),
        headers: { authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(`Garmin deregistration returned ${response.status}`)
    },
  }
}
