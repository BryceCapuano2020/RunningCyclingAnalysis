import type { LevelRung } from '@rca/core/standing'

/** A plain meaning for each level below Local, shown on Method and Balance. Below 60% the bands are this app's own, not WMA's. */
export const OWN_LEVEL_MEANING: readonly { name: string; meaning: string }[] = [
  { name: 'Club', meaning: 'you hold your own in a club race.' },
  { name: 'Trained', meaning: 'structured training shows.' },
  { name: 'Active', meaning: 'you exercise most weeks.' },
  { name: 'Recreational', meaning: 'you move for fun.' },
]

/** The meaning of a level below Local, or undefined for a WMA class, whose name says it. */
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
