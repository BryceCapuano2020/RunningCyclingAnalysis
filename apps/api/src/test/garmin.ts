import type { GarminGrant, GarminOAuth } from '../garmin/oauth.ts'
import { toBase64Url } from '../util.ts'

/** A valid PROVIDER_TOKEN_KEY for tests: two synthetic keys, so a test can rotate. */
export const TEST_PROVIDER_TOKEN_KEY = `t2:${toBase64Url(new Uint8Array(32).fill(7))},t1:${toBase64Url(new Uint8Array(32).fill(3))}`

/** The bindings that turn Garmin connecting on in a test harness. */
export const GARMIN_ON = {
  GARMIN_ENABLED: 'true',
  GARMIN_CLIENT_ID: 'test-garmin-client',
  GARMIN_CLIENT_SECRET: 'test-garmin-secret',
  PROVIDER_TOKEN_KEY: TEST_PROVIDER_TOKEN_KEY,
}

export interface FakeGarmin extends GarminOAuth {
  exchanges: { code: string; codeVerifier: string }[]
  /** The access tokens deregistered, in order. */
  deregistered: string[]
}

export interface FakeGarminOptions {
  /** The Garmin user each code grants; by default the code names it (`code-for-<user>`). */
  garminUserId?: string
  failExchange?: boolean
  failDeregister?: boolean
}

/** Stands in for Garmin's OAuth: the authorize page, the token and user-id calls, and deregistration. */
export function fakeGarmin(options: FakeGarminOptions = {}): FakeGarmin {
  const exchanges: FakeGarmin['exchanges'] = []
  const deregistered: string[] = []
  return {
    exchanges,
    deregistered,
    authorizationUrl: async (state) =>
      new URL(`https://connect.garmin.test/oauth2Confirm?state=${state}`),
    async exchangeCode(code, codeVerifier): Promise<GarminGrant> {
      exchanges.push({ code, codeVerifier })
      if (options.failExchange) throw new Error('token endpoint unavailable')
      const garminUserId = options.garminUserId ?? code.replace(/^code-for-/, '')
      return {
        garminUserId,
        tokens: {
          accessToken: `access-${garminUserId}-${exchanges.length}`,
          refreshToken: 'refresh',
        },
        scopes: ['ACTIVITY_EXPORT'],
      }
    },
    async deregister(accessToken) {
      deregistered.push(accessToken)
      if (options.failDeregister) throw new Error('deregistration unavailable')
    },
  }
}
