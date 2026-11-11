import type { Bindings } from '../env.ts'
import { parseTokenKeys } from '../providers/tokens.ts'

const ON = new Set(['true', '1', 'on'])

type GarminEnv = Pick<Bindings, 'GARMIN_ENABLED' | 'GARMIN_CLIENT_ID' | 'PROVIDER_TOKEN_KEY'>

/**
 * Whether athletes may connect Garmin (docs/design/garmin-sync.md section 5a): "true", "1" or "on". Unset or anything
 * else is off, as production ships until G6; the deploy-config check refuses it on in wrangler.toml. Off gates
 * connecting only: disconnect, deregistration and account deletion still remove a link.
 */
export function garminEnabled(env: Pick<GarminEnv, 'GARMIN_ENABLED'>): boolean {
  // String(): a [vars] value written unquoted reaches the Worker as a boolean.
  return ON.has(
    String(env.GARMIN_ENABLED ?? '')
      .trim()
      .toLowerCase(),
  )
}

/** Whether a connect can finish: the client id and a valid token key are set. On without them is a 503, not a link. */
export function garminConfigured(env: GarminEnv): boolean {
  return (
    (env.GARMIN_CLIENT_ID ?? '').trim() !== '' && parseTokenKeys(env.PROVIDER_TOKEN_KEY) !== null
  )
}
