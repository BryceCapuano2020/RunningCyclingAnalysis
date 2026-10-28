import type { Sport } from '../types'
import type { CadenceUnit } from './types'

/** What the activity trace and the file readers need to know about each sport. */
export interface SportTraceSpec {
  /** The unit of the cadence a FIT or TCX file records, once multiplied by `cadenceMultiplier`. */
  cadenceUnit: CadenceUnit
  /** A GPX extension names no unit for a run's cadence, so a run reads as unknown there. */
  gpxCadenceUnit: CadenceUnit
  /**
   * What a recorded FIT or TCX cadence is multiplied by to reach `cadenceUnit`. A run records
   * strides (cycles of two steps) per minute; a ride records revolutions per minute.
   */
  cadenceMultiplier: number
  /** The TCX Trackpoint field that carries this sport's cadence. */
  tcxCadenceField: 'cadence' | 'runCadence'
  /** The fastest speed, m/s, a sample may have. Faster samples are impossible. */
  maxSpeedMs: number
}

/** Per-sport trace values. A sport is added by adding a row. */
export const SPORT_TRACE: Record<Sport, SportTraceSpec> = {
  run: {
    cadenceUnit: 'steps/min',
    gpxCadenceUnit: 'unknown',
    cadenceMultiplier: 2,
    tcxCadenceField: 'runCadence',
    maxSpeedMs: 12.5,
  },
  ride: {
    cadenceUnit: 'rev/min',
    gpxCadenceUnit: 'rev/min',
    cadenceMultiplier: 1,
    tcxCadenceField: 'cadence',
    maxSpeedMs: 30,
  },
}

/** Whether a value names a sport that has a row in SPORT_TRACE. */
export function isSport(value: unknown): value is Sport {
  return typeof value === 'string' && Object.hasOwn(SPORT_TRACE, value)
}
