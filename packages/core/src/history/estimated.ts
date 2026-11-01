import type { ActivityDigest, Sport } from '../types'

/**
 * Whether a best rests on a model and not a meter, by sport. A ride's watts that did not come from a power meter are
 * estimated, and so are a ride's whose activity is not known (its power source is unknown), as the records tag them. A
 * run's pace is never tagged.
 */
const ESTIMATED: Record<Sport, (digest: ActivityDigest | undefined) => boolean> = {
  run: () => false,
  ride: (digest) => digest?.powerSource !== 'measured',
}

export const isEstimated = (sport: Sport, digest: ActivityDigest | undefined): boolean =>
  ESTIMATED[sport](digest)
