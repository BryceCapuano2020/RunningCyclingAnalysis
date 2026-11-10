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

/** The meaning of a level, or undefined for a name that is not one. */
export function levelMeaning(name: string): string | undefined {
  return OWN_LEVEL_MEANING.find((level) => level.name === name)?.meaning
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
