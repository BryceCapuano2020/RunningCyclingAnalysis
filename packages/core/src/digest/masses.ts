import { hasDatedMass, massAtFor } from '../athlete/mass'
import type { AthleteSettings, ActivityDigest } from '../types'

/** The masses an activity is priced at: its own body mass by its date, and the bike on top. */
export interface Masses {
  /** Body mass in effect on the activity's local date, kg. */
  bodyKg(digest: Pick<ActivityDigest, 'startMs'>): number
  /** Body plus bike and kit, kg. */
  totalKg(digest: Pick<ActivityDigest, 'startMs'>): number
  /** Whether activities may differ in mass, because some body mass is dated. */
  dated: boolean
}

/** One body mass and bike mass for every activity: what an analysis without dated masses uses. */
export function fixedMasses(massKg: number, bikeMassKg: number): Masses {
  return { bodyKg: () => massKg, totalKg: () => massKg + bikeMassKg, dated: false }
}

/** The masses of an analysis: dated body masses when settings have them, else settings.massKg. */
export function massesOf(settings: AthleteSettings): Masses {
  if (!hasDatedMass(settings)) return fixedMasses(settings.massKg, settings.bikeMassKg)
  const bodyAt = massAtFor(settings)
  return {
    bodyKg: (digest) => bodyAt(digest.startMs),
    totalKg: (digest) => bodyAt(digest.startMs) + settings.bikeMassKg,
    dated: true,
  }
}
