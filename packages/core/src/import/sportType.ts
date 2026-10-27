import type { Sport } from '../types'
import type { Rejection } from './result'

/**
 * Maps a sport's name to a sport: the type a GPX track gives, or the Activity Type of a Strava export's
 * list. A name it cannot place is refused, not guessed.
 */

const NO_SPORT = 'This GPX file does not say whether it is a run or a ride'
const E_BIKE_REASON =
  'E-bike activities are not supported because motor assistance hides your own power'

/** Names are matched in lower case, with each run of spaces, dashes and underscores as one space. */
const RUN_TYPES = new Set(['run', 'running', 'trail run', 'trail running', 'trailrun', '9'])
const INDOOR_RUN_TYPES = new Set(['virtual run'])
const RIDE_TYPES = new Set([
  'ride',
  'cycling',
  'biking',
  'road biking',
  'mountain biking',
  'gravel cycling',
  'gravel ride',
  'mountain bike ride',
  '1',
])
const INDOOR_RIDE_TYPES = new Set(['virtual ride', 'indoor cycling'])
/** Matched with spaces, dashes and underscores removed. Same e-bike names as FIT's sport and sub-sports. */
const E_BIKE_KEYS = new Set([
  'ebike',
  'ebikeride',
  'ebiking',
  'ebikefitness',
  'ebikemountain',
  'ebikeenduro',
  'emountainbikeride',
])
/** A sport named only by its number, as the oldest Strava GPX files do. */
const CODE = /^\d+$/

export interface SportChoice {
  sport: Sport | null
  indoor: boolean
  sportLabel: string
  refusal?: { skipped: string } & Rejection
}

/**
 * The sport of a track's `type`. A track that names none takes the sport of `listed`, the type its
 * export's list gives, and is refused as unsaid only when the list names none either. A track that names
 * its sport keeps it. A refusal is labelled with the sport's name, which is the list's for a sport the
 * track names only by number.
 */
export function sportOfType(
  type: string | undefined,
  creator: string | undefined,
  listed?: string,
): SportChoice {
  if (type === undefined) return listed === undefined ? unsaid(creator) : choiceOf(listed)
  const choice = choiceOf(type)
  return choice.sport === null && listed !== undefined && CODE.test(type.trim())
    ? { ...choice, sportLabel: listed }
    : choice
}

function choiceOf(type: string): SportChoice {
  const key = type
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()
  if (RUN_TYPES.has(key)) return { sport: 'run', indoor: false, sportLabel: type }
  if (INDOOR_RUN_TYPES.has(key)) return { sport: 'run', indoor: true, sportLabel: type }
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
function unsaid(creator: string | undefined): SportChoice {
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

function noSportReason(creator: string | undefined): string {
  const name = creator?.replace(/\s+/g, ' ').trim().slice(0, 80)
  return name ? `${NO_SPORT} (creator: ${name})` : NO_SPORT
}
