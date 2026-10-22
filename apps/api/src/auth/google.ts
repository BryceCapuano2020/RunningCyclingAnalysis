import { z } from 'zod'
import type { Bindings } from '../env.ts'
import { HttpError } from '../errors.ts'
import { fromBase64UrlUtf8, toBase64Url } from '../util.ts'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPES = 'openid email profile'
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

export interface GoogleOAuth {
  authorizationUrl(state: string, codeVerifier: string): Promise<URL>
  /** Exchanges the authorization code and returns the raw ID token. Throws on failure. */
  exchangeCode(code: string, codeVerifier: string): Promise<string>
}

export function googleRedirectUri(env: Bindings): string {
  return `${env.APP_URL}/api/auth/google/callback`
}

/** PKCE S256 challenge: base64url(SHA-256(verifier)), RFC 7636 section 4.2. */
export async function pkceChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  return toBase64Url(new Uint8Array(digest))
}

const tokenResponseSchema = z.object({ id_token: z.string() })

export function createGoogleOAuth(env: Bindings): GoogleOAuth {
  const redirectUri = googleRedirectUri(env)
  return {
    async authorizationUrl(state, codeVerifier) {
      const url = new URL(AUTH_ENDPOINT)
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: GOOGLE_SCOPES,
        state,
        code_challenge: await pkceChallenge(codeVerifier),
        code_challenge_method: 'S256',
        access_type: 'online',
        prompt: 'select_account',
      }).toString()
      return url
    },
    async exchangeCode(code, codeVerifier) {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          code_verifier: codeVerifier,
        }),
      })
      if (!response.ok) throw new Error(`Google token endpoint returned ${response.status}`)
      const parsed = tokenResponseSchema.safeParse(await response.json())
      if (!parsed.success) throw new Error('Google token response has no id_token')
      return parsed.data.id_token
    },
  }
}

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  azp: z.string().optional(),
  exp: z.number(),
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().optional(),
})

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  pictureUrl: string | null
}

/**
 * Reads the claims of an ID token that arrived directly from Google's token endpoint over TLS.
 * OpenID Connect allows skipping the signature check in that case, so the claims are checked here.
 */
export function parseGoogleIdToken(
  idToken: string,
  clientId: string,
  nowMs: number,
): GoogleProfile {
  const malformed = () => new HttpError(502, 'oauth_bad_id_token', 'Google returned a bad ID token')
  const [header, payload, signature] = idToken.split('.')
  if (header === undefined || payload === undefined || signature === undefined) throw malformed()

  let json: unknown
  try {
    json = JSON.parse(fromBase64UrlUtf8(payload))
  } catch {
    throw malformed()
  }
  const parsed = claimsSchema.safeParse(json)
  if (!parsed.success) throw malformed()
  const claims = parsed.data

  if (!GOOGLE_ISSUERS.has(claims.iss)) throw malformed()
  const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud
  if (!audiences.includes(clientId)) throw malformed()
  // Google sets azp (the authorized party) to the client when the token has several audiences.
  if (claims.azp !== undefined && claims.azp !== clientId) throw malformed()
  if (claims.exp * 1000 <= nowMs) {
    throw new HttpError(400, 'oauth_token_expired', 'Google ID token has expired')
  }
  if (!claims.email_verified) {
    throw new HttpError(403, 'email_not_verified', 'Your Google email address is not verified')
  }

  const name = claims.name?.trim() || claims.email.split('@')[0] || claims.email
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name,
    pictureUrl: claims.picture ?? null,
  }
}
