import type { WeekRecord } from '../fitness/machine'

/** One slip as the fitness card followed it: when it was declared, whether it reached "back", and whether it came apart again. */
export interface LiveEpisode {
  /** The week (since the origin) the monitor declared the slip. */
  declaredWeek: number
  /** The week the monitor first said "back" for it; null if it never did. */
  backWeek: number | null
  /** After "back" the monitor reopened it as a slip (the level fell away again). */
  relapsed: boolean
}

/**
 * The slips the monitor declared through `horizonWeek`, with where each reached "back". The look-back reads these so that it
 * never says less of a recovery than the card did: a recovery the card confirmed and later data does not contradict is back.
 */
export function liveEpisodes(records: readonly WeekRecord[], horizonWeek: number): LiveEpisode[] {
  const out: LiveEpisode[] = []
  let previous: WeekRecord | undefined
  for (const r of records) {
    if (r.w > horizonWeek) break
    const current = out.at(-1)
    if (r.state === 'slipping' && r.fresh) {
      // A slip declared straight out of "back" is the same episode reopening; any other is a new one.
      if (previous?.state === 'back' && current !== undefined) current.relapsed = true
      else out.push({ declaredWeek: r.w, backWeek: null, relapsed: false })
    } else if (r.state === 'back' && r.fresh && current !== undefined) {
      current.backWeek ??= r.w
    }
    previous = r
  }
  return out
}
