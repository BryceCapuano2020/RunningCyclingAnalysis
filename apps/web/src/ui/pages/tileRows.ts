import { HALF_MARATHON_M, RUN_RECORD_DISTANCES_M } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import type { RecordRow } from '../recordRow'
import { RECORD_DURATIONS_S } from '../records'

/** The row keys of a distance best, as bestEffortRows names them. */
const distanceKey = (metres: number): string => `distance-${metres}`

/**
 * The records each sport's page shows as tiles under its curve, by the key of their row: a run's are the
 * distances it is raced at, a ride's the durations its power is read at. The rest stay in the full list.
 */
export const RECORD_TILE_KEYS: Record<Sport, readonly string[]> = {
  // The half marathon is a race prediction's distance as well; the tiles stop at the 10 km.
  run: RUN_RECORD_DISTANCES_M.filter((metres) => metres !== HALF_MARATHON_M).map(distanceKey),
  ride: RECORD_DURATIONS_S.ride.map(String),
}

/** A tile is shown for at most this many records, whichever sport. */
const MAX_TILES = 4

/**
 * The rows that become tiles, in the order the sport lists them: those of RECORD_TILE_KEYS that exist. A run
 * with none of its distance bests (its files were added before they were recorded) shows its duration
 * bests instead, so the strip is not empty under a curve that has them.
 */
export function tileRows(sport: Sport, rows: readonly RecordRow[]): RecordRow[] {
  const keys = RECORD_TILE_KEYS[sport]
  const chosen = keys.flatMap((key) => rows.find((row) => row.key === key) ?? [])
  return (chosen.length > 0 ? chosen : [...rows]).slice(0, MAX_TILES)
}

/** The one activity every tile's record was set in, when there are several tiles and they share it. */
export function sharedTileActivity(tiles: readonly RecordRow[]): RecordRow['activity'] {
  const first = tiles[0]?.activity ?? null
  if (tiles.length < 2 || first === null) return null
  return tiles.every((tile) => tile.activity?.id === first.id) ? first : null
}
