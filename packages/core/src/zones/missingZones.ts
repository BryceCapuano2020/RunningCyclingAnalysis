import type { Dated } from '../calendar'
import type { AthleteSettings } from '../athlete/settings'
import { outgrownAt } from '../digest/thresholdTimelineTypes'
import type { Sport } from '../types'
import { ZONE_MEASURES } from './schemes'
import type { ZoneMeasure } from './schemes'
import { zonesAt } from './zones'
import type { ZoneEstimates } from './zones'

/** A pace or power the athlete has activities in the sport for but no zones on a date. */
export interface MissingZones {
  sport: Sport
  measure: ZoneMeasure
  /** A pace or power whose efforts on the date are above the threshold on file: the older fit is left out as too low. */
  outgrown: boolean
}

/** The measures whose estimate is a threshold: with no efforts to fit one, they have no zones. */
const THRESHOLD_MEASURES: readonly ZoneMeasure[] = ['pace', 'power']

/**
 * The measures with no zones on a date although the library holds activities of the sport. A pace or power: no threshold
 * is entered, the window ending then supports no fit, no earlier fit is within a year, and the library holds no effort of
 * 20 minutes to stand as a floor. A heart rate always has zones once the library holds a heart rate. The page says what
 * would give the others.
 */
export function missingThresholdZones(
  at: number | Dated,
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
): MissingZones[] {
  if (estimates === null) return []
  const present = new Set(
    zonesAt(at, settings, estimates).map((set) => `${set.sport}.${set.measure}`),
  )
  return (Object.keys(ZONE_MEASURES) as Sport[]).flatMap((sport) =>
    ZONE_MEASURES[sport]
      .filter((measure) => THRESHOLD_MEASURES.includes(measure))
      .filter((measure) => !present.has(`${sport}.${measure}`))
      .filter(() => estimates.thresholds[sport].length > 0)
      .map((measure) => ({
        sport,
        measure,
        outgrown: outgrownAt(estimates.thresholds[sport], at),
      })),
  )
}
