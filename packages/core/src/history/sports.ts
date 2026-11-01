import { SPORTS } from '../types'
import type { Sport } from '../types'

/** A record with one entry for each sport, made by `make`, so no part names a sport. */
export function perSport<T>(make: (sport: Sport) => T): Record<Sport, T> {
  return Object.fromEntries(SPORTS.map((sport) => [sport, make(sport)])) as Record<Sport, T>
}
