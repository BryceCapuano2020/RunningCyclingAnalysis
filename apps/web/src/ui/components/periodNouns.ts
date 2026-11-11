/** What is counted in the period: the activities, or one sport's or the lifting days, which take their own words. */
export const NOUNS: Record<'activity' | 'run' | 'ride' | 'lift', [string, string]> = {
  activity: ['activity', 'activities'],
  run: ['run', 'runs'],
  ride: ['ride', 'rides'],
  lift: ['lift', 'lifts'],
}

/** Shown after a reversed range is applied: its days are taken in order, so the caption dates them right. */
export const SWAPPED_NOTE = 'Swapped so From comes first.'
