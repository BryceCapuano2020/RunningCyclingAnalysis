import type { Sport } from '../types'

/** The sports a history row is built for, in the order the app lists them. One place, so a new sport adds its row here. */
export const HISTORY_SPORTS: readonly Sport[] = ['run', 'ride']

/** A record with one entry for each history sport, made by `make`, so no part names a sport. */
export function perSport<T>(make: (sport: Sport) => T): Record<Sport, T> {
  return Object.fromEntries(HISTORY_SPORTS.map((sport) => [sport, make(sport)])) as Record<Sport, T>
}
