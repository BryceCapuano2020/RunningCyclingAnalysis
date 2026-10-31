import { hasDatedMass, massAtFor } from '../athlete/mass'
import type { AthleteSettings, ActivityDigest } from '../types'

/**
 * The masses an activity is priced at: its own body mass by its date, and the bike on top. It also says
 * whose implausible power the athlete kept, since pricing is where that power is set aside.
 */
export interface Masses {
  /** Body mass in effect on the activity's local date, kg. */
  bodyKg(digest: Pick<ActivityDigest, 'startMs'>): number
  /** Body plus bike and kit, kg. */
  totalKg(digest: Pick<ActivityDigest, 'startMs'>): number
  /** Whether activities may differ in mass, because some body mass is dated. */
  dated: boolean
  /** False while the body mass is a placeholder, when power per kilo cannot be judged. */
  massKnown: boolean
  /** Whether the athlete chose to keep this ride's power although it is implausible (see implausiblePower). */
  powerKept(digest: Pick<ActivityDigest, 'id'>): boolean
}

const NONE_KEPT: ReadonlySet<string> = new Set()

/** One body mass and bike mass for every activity: what an analysis without dated masses uses. */
export function fixedMasses(
  massKg: number,
  bikeMassKg: number,
  kept: ReadonlySet<string> = NONE_KEPT,
  massKnown = true,
): Masses {
  return {
    bodyKg: () => massKg,
    totalKg: () => massKg + bikeMassKg,
    dated: false,
    massKnown,
    powerKept: (digest) => kept.has(digest.id),
  }
}

/** The masses of an analysis: dated body masses when settings have them, else settings.massKg. */
export function massesOf(settings: AthleteSettings): Masses {
  const kept = new Set(settings.keepPower ?? [])
  if (!hasDatedMass(settings))
    return fixedMasses(settings.massKg, settings.bikeMassKg, kept, settings.massAssumed !== true)
  const bodyAt = massAtFor(settings)
  return {
    bodyKg: (digest) => bodyAt(digest.startMs),
    totalKg: (digest) => bodyAt(digest.startMs) + settings.bikeMassKg,
    dated: true,
    massKnown: true,
    powerKept: (digest) => kept.has(digest.id),
  }
}
