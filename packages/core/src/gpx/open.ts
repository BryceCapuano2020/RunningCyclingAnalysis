import type { GpxPoint } from './records'
import type { LatLon } from '../import/trackpoints'

/** One trkpt with a valid time. Position, altitude and extensions are optional. */
export type Point = GpxPoint

/** The trkpt being read. Each value is taken from the first child or extension that gives one. */
export interface OpenPoint {
  position: LatLon | undefined
  tMs: number | undefined
  altitude: number | undefined
  heartRate: number | undefined
  power: number | undefined
  cadence: number | undefined
  temperature: number | undefined
  eleSeen: boolean
  timeSeen: boolean
}

/** The trk being read. */
export interface OpenTrack {
  type: string | undefined
  typeSeen: boolean
  name: string | undefined
  nameSeen: boolean
  anyPosition: boolean
  points: Point[]
  /** Trackpoints without a valid time. */
  untimed: number
  /** Seconds east of UTC given by the zone designator of the first trackpoint time, when it has one. */
  zoneOffsetS: number | undefined
}

export function newTrack(): OpenTrack {
  return {
    type: undefined,
    typeSeen: false,
    name: undefined,
    nameSeen: false,
    anyPosition: false,
    points: [],
    untimed: 0,
    zoneOffsetS: undefined,
  }
}
