import { implausiblePower } from '../curves'
import { estimatedPowerOver } from './estimatedPower'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import type { Masses } from './masses'
import { massesOf } from './masses'

/** Whether a sport's power is judged against the pro ceiling: a ride's is, a run has no power. */
const POWER_JUDGED: Record<Sport, boolean> = { run: false, ride: true }

/**
 * Whether a ride's power is in question (see implausiblePower, and estimatedPowerOver for a ride without a meter): 'set-aside' while it is left out of every best,
 * 'kept' once the athlete chose to keep it. Undefined for a run, for a ride whose power is plausible, and while
 * no body weight is known: power per kilo cannot be judged at a placeholder mass.
 */
export function powerCheckOf(
  digest: ActivityDigest,
  masses: Masses,
): 'set-aside' | 'kept' | undefined {
  if (!POWER_JUDGED[digest.sport] || !masses.massKnown) return undefined
  if (
    !implausiblePower(digest, masses.bodyKg(digest)) &&
    estimatedPowerOver(digest, masses) === undefined
  ) {
    return undefined
  }
  return masses.powerKept(digest) ? 'kept' : 'set-aside'
}

/**
 * The digests whose power the analysis may use: those in ordered less the rides set aside. Every ride
 * computation that reads power (the bike model's calibration, the heart-rate lines of the estimated-ride gate,
 * the bests) takes its rides from here.
 */
export function trustedPower(ordered: ActivityDigest[], masses: Masses): ActivityDigest[] {
  return ordered.filter((digest) => powerCheckOf(digest, masses) !== 'set-aside')
}

/** The ids of the rides whose power is set aside under these settings. */
export function powerSetAsideIds(
  digests: readonly ActivityDigest[],
  settings: AthleteSettings,
): Set<string> {
  const masses = massesOf(settings)
  return new Set(
    digests.filter((digest) => powerCheckOf(digest, masses) === 'set-aside').map((d) => d.id),
  )
}
