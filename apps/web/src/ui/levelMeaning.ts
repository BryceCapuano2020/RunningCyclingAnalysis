import type { LevelRung } from '@rca/core/standing'

/**
 * A plain meaning for each level, shown on Method and Balance. From Local up the levels are WMA's classes; below 60% the bands
 * are this app's own.
 */
export const OWN_LEVEL_MEANING: readonly { name: string; meaning: string }[] = [
  { name: 'World', meaning: 'among the best in the world for your age.' },
  { name: 'National', meaning: 'you contend at a national championship.' },
  { name: 'Regional', meaning: 'you place at regional championships.' },
  { name: 'Local', meaning: 'you win your age group at local races.' },
  { name: 'Club', meaning: 'you hold your own in a club race.' },
  { name: 'Trained', meaning: 'structured training shows.' },
  { name: 'Active', meaning: 'you exercise most weeks.' },
  { name: 'Recreational', meaning: 'you move for fun.' },
]

/**
 * The same levels in a lifter's terms, for the Lift page's table: its grade is a total against powerlifting meets' results, so a
 * level reads as a place at a meet, not a race.
 */
export const LIFT_LEVEL_MEANING: readonly { name: string; meaning: string }[] = [
  { name: 'World', meaning: 'among the best lifters in the world for your age.' },
  { name: 'National', meaning: 'you place at a national meet.' },
  { name: 'Regional', meaning: 'you place at a regional meet.' },
  { name: 'Local', meaning: 'you win your class at a local meet.' },
  { name: 'Club', meaning: 'you post a solid total at a local meet.' },
  { name: 'Trained', meaning: 'steady programmed lifting shows.' },
  { name: 'Active', meaning: 'you lift most weeks.' },
  { name: 'Recreational', meaning: 'you lift now and then.' },
]

/** The meaning of a level, or undefined for a name that is not one; `lift` gives the lifter's terms. */
export function levelMeaning(name: string, lift = false): string | undefined {
  return (lift ? LIFT_LEVEL_MEANING : OWN_LEVEL_MEANING).find((level) => level.name === name)
    ?.meaning
}

/** The meaning as the second line of its level, so it starts with a capital; undefined for a name that is not a level. */
export function levelMeaningLine(name: string, lift = false): string | undefined {
  const text = levelMeaning(name, lift)
  return text === undefined ? undefined : text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * The band of the ladder's level at `index`, in whole percents, as it starts a line: "90% and up", "80% to 89%", and for the
 * lowest, "Under 30%", the floor of the level above it.
 */
export function levelBandText(ladder: readonly LevelRung[], index: number): string {
  const rung = ladder[index]
  if (rung === undefined) return ''
  const above = ladder[index - 1]
  if (rung.high === null || above === undefined) return `${rung.low}% and up`
  if (rung.low === 0) return `Under ${above.low}%`
  return `${rung.low}% to ${rung.high}%`
}
