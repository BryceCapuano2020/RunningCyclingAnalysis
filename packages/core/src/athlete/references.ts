import type { Sex } from '../grade/ageGrade'
import { SPORTS } from '../types'
import type { Sport } from '../types'
import { sameMasses } from './mass'
import { entriesOf, entryAt } from './measurements'
import type { AthleteSettings } from './settings'

/** What the settings say about the heart-rate reference: the year of birth and any maximum the athlete entered. */
export interface ReferenceSettings {
  birthYear: number | null
  /** The sex, when given; the age-predicted maximum is Tanaka's unless it is female (Gulati). */
  sex: Sex | null
  /** The maximum heart rate entered for each sport, bpm, in effect at the instant asked; null when none. */
  entered: Record<Sport, number | null>
}

export const NO_REFERENCE_SETTINGS: ReferenceSettings = {
  birthYear: null,
  sex: null,
  entered: { run: null, ride: null },
}

/** The reference settings as of an instant: an entered maximum applies from its date, the earliest before the first. */
export function referenceSettingsOf(
  settings: Pick<AthleteSettings, 'measurements' | 'birthYear' | 'sex'>,
  atMs: number,
): ReferenceSettings {
  const entered = (sport: Sport) =>
    Number.isFinite(atMs)
      ? (entryAt(settings.measurements ?? [], 'maxHeartRate', sport, atMs)?.value ?? null)
      : null
  return {
    birthYear: settings.birthYear ?? null,
    sex: settings.sex ?? null,
    entered: { run: entered('run'), ride: entered('ride') },
  }
}

/**
 * Whether two settings give the heart-rate reference the same inputs: the year of birth and every entered maximum. A cached
 * judgement or analysis depends on these as well as on the masses, since the effort gate reads them.
 */
export function sameReferenceSettings(a: AthleteSettings, b: AthleteSettings): boolean {
  if ((a.birthYear ?? null) !== (b.birthYear ?? null)) return false
  if ((a.sex ?? null) !== (b.sex ?? null)) return false
  return SPORTS.every((sport) => {
    const [left, right] = [
      entriesOf(a.measurements ?? [], 'maxHeartRate', sport),
      entriesOf(b.measurements ?? [], 'maxHeartRate', sport),
    ]
    return (
      left.length === right.length &&
      left.every((entry, i) => entry.from === right[i]!.from && entry.value === right[i]!.value)
    )
  })
}

/** Whether a cached analysis made from one settings holds for another: the same masses and the same reference inputs. */
export function sameAnalysisSettings(a: AthleteSettings, b: AthleteSettings): boolean {
  return sameMasses(a, b) && sameReferenceSettings(a, b)
}
