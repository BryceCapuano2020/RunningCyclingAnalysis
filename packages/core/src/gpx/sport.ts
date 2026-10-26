import type { Sport } from '../types'
import type { Rejection } from '../import/result'

/** Maps a GPX track's type to a sport. A track it cannot place is refused, not guessed. */

const NO_SPORT = 'This GPX file does not say whether it is a run or a ride'
const E_BIKE_REASON =
  'E-bike activities are not supported because motor assistance hides your own power'

const RUN_TYPES = new Set(['run', 'running', 'trail_running', 'trailrun', '9'])
const RIDE_TYPES = new Set([
  'ride',
  'cycling',
  'biking',
  'road_biking',
  'mountain_biking',
  'gravel_cycling',
  '1',
])
const INDOOR_RIDE_TYPES = new Set(['virtual_ride', 'indoor_cycling'])
/** Matched with spaces, dashes and underscores removed. Same e-bike names as FIT's sport and sub-sports. */
const E_BIKE_KEYS = new Set([
  'ebike',
  'ebikeride',
  'ebiking',
  'ebikefitness',
  'ebikemountain',
  'ebikeenduro',
])

export interface SportChoice {
  sport: Sport | null
  indoor: boolean
  sportLabel: string
  refusal?: { skipped: string } & Rejection
}

export function sportOf(type: string | undefined, creator: string | undefined): SportChoice {
  if (type === undefined) {
    return {
      sport: null,
      indoor: false,
      sportLabel: 'unknown',
      refusal: {
        reason: noSportReason(creator),
        code: 'no-sport',
        skipped: 'track with no sport skipped',
      },
    }
  }
  const key = type.toLowerCase()
  if (RUN_TYPES.has(key)) return { sport: 'run', indoor: false, sportLabel: type }
  if (RIDE_TYPES.has(key)) return { sport: 'ride', indoor: false, sportLabel: type }
  if (INDOOR_RIDE_TYPES.has(key)) return { sport: 'ride', indoor: true, sportLabel: type }
  if (E_BIKE_KEYS.has(key.replace(/[^a-z0-9]/g, ''))) {
    const refusal = {
      reason: E_BIKE_REASON,
      code: 'e-bike' as const,
      skipped: 'e-bike session skipped',
    }
    return { sport: null, indoor: false, sportLabel: type, refusal }
  }
  return { sport: null, indoor: false, sportLabel: type }
}

/** Refuses to guess: a run and a ride are compared differently, so a guess would corrupt the result. */
function noSportReason(creator: string | undefined): string {
  const name = creator?.replace(/\s+/g, ' ').trim().slice(0, 80)
  return name ? `${NO_SPORT} (creator: ${name})` : NO_SPORT
}
